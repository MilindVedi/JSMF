import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EntitlementSource,
  EntitlementStatus,
  OfflinePaymentMethod,
  OfflineSaleEntry,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { parseOfflineSaleRows, type OfflineSaleRow, type OfflineSaleRowError } from '../domain/offline-sale-rows';
import { nextOrderNumber } from '../domain/order-number';
import { OfflineSaleHandlers, type OfflineSaleHandler } from './offline-sale-handlers';

/** Who is recording, and through which door. */
export interface OfflineSaleActor {
  /** Null for the terminal script, which has no signed-in admin. */
  userId: string | null;
  ip?: string | null;
  entry: OfflineSaleEntry;
}

export type OfflineSalePlanAction = 'create' | 'attach' | 'skip';

export interface OfflineSalePlanRow {
  index: number;
  name: string;
  email: string;
  whatsappNumber: string | null;
  amountPaidMinor: string;
  discountMinor: string;
  method: OfflinePaymentMethod;
  reference: string | null;
  note: string | null;
  paidAt: string;
  details: Record<string, unknown>;
  /** create = new account; attach = existing account; skip = already has access. */
  action: OfflineSalePlanAction;
  /** The existing account's name, when attaching or skipping. */
  existingName: string | null;
}

/** The payment column records how the money arrived, in the words checkout uses. */
const PAYMENT_METHOD_LABEL: Record<OfflinePaymentMethod, string | null> = {
  RAZORPAY_PAYMENT_PAGE: null,
  UPI_DIRECT: 'upi',
  BANK_TRANSFER: 'bank_transfer',
  CASH: 'cash',
  OTHER: 'other',
};

/**
 * Records purchases whose money arrived outside checkout — a direct UPI
 * transfer, Razorpay's Payment Page, cash — as ordinary paid orders.
 *
 * Writes exactly what checkout's settlement would have: a PAID order (with
 * its discount), a CAPTURED payment, an ACTIVE entitlement and the included
 * items, all dated at the real payment time. Then the product type's handler
 * adds its own rows (a session registration), and an OfflineSale row says
 * where the money came from and who recorded it.
 *
 * Sends no email. The buyer was dealt with in person when they paid, and the
 * product's ordinary flows (a session's reminders, "Notify attendees") reach
 * them from now on like anyone else.
 *
 * Every row is checked before anything is written; then each buyer is written
 * in their own transaction, and one that already has access is skipped, so a
 * list can be sent again after a fix without duplicating anyone.
 */
@Injectable()
export class OfflineSaleService {
  private readonly logger = new Logger(OfflineSaleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly handlers: OfflineSaleHandlers,
    private readonly audit: AuditService,
  ) {}

  /** What recording `raw` would do, row by row. Writes nothing. */
  async preview(productId: string, raw: unknown) {
    const prepared = await this.prepare(productId, raw);
    const warnings =
      prepared.errors.length === 0 && prepared.handler.warnings
        ? await prepared.handler.warnings(
            productId,
            prepared.plan.filter((row) => row.action !== 'skip').length,
          )
        : [];

    return {
      product: prepared.product,
      rows: prepared.plan,
      errors: prepared.errors,
      warnings,
    };
  }

  async record(productId: string, raw: unknown, actor: OfflineSaleActor) {
    const prepared = await this.prepare(productId, raw);
    if (prepared.errors.length > 0) {
      throw new BadRequestException({
        message: 'Some rows need fixing before anything is recorded.',
        errors: prepared.errors,
      });
    }

    const { product, handler, plan } = prepared;
    const bundle = await this.prisma.productBundleItem.findMany({
      // Same filter checkout grants with (payment.service.ts, settle()).
      where: { bundleProductId: productId, child: { deletedAt: null } },
      select: { childProductId: true },
      orderBy: { sortOrder: 'asc' },
    });

    const recorded: Array<{ index: number; email: string; orderNumber: string }> = [];
    const skipped: Array<{ index: number; email: string; reason: string }> = [];
    const failed: Array<{ index: number; email: string; reason: string }> = [];

    for (const row of plan) {
      if (row.action === 'skip') {
        skipped.push({ index: row.index, email: row.email, reason: 'Already has access to this product.' });
        continue;
      }

      try {
        const orderNumber = await this.prisma.$transaction((tx) =>
          this.recordOne(tx, { product, handler, bundle, row, actor }),
        );
        if (orderNumber === null) {
          skipped.push({ index: row.index, email: row.email, reason: 'Already has access to this product.' });
        } else {
          recorded.push({ index: row.index, email: row.email, orderNumber });
        }
      } catch (cause) {
        failed.push({ index: row.index, email: row.email, reason: failureReason(cause) });
        this.logger.error(`Offline sale for ${row.email} failed: ${cause instanceof Error ? cause.message : cause}`);
      }
    }

    activity(this.logger, 'offline_sale.batch_recorded', {
      productId,
      entry: actor.entry,
      actorUserId: actor.userId,
      recorded: recorded.length,
      skipped: skipped.length,
      failed: failed.length,
    });

    return { recorded, skipped, failed };
  }

  /** Everyone recorded offline for one product, in payment order. */
  async list(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const sales = await this.prisma.offlineSale.findMany({
      where: { productId },
      orderBy: { paidAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true, contactPhone: true } },
        recordedBy: { select: { name: true } },
        order: {
          select: {
            orderNumber: true,
            status: true,
            subtotalAmountMinor: true,
            discountAmountMinor: true,
            totalAmountMinor: true,
            currency: true,
          },
        },
      },
    });

    const handler = this.handlers.for(product.type);
    const details = handler?.describe
      ? await handler.describe(productId, sales.map((sale) => sale.userId))
      : new Map<string, Record<string, string>>();

    return sales.map((sale) => ({
      id: sale.id,
      user: sale.user,
      method: sale.method,
      reference: sale.reference,
      note: sale.note,
      paidAt: sale.paidAt,
      entry: sale.entry,
      recordedBy: sale.recordedBy?.name ?? null,
      createdAt: sale.createdAt,
      order: {
        orderNumber: sale.order.orderNumber,
        status: sale.order.status,
        listPriceMinor: sale.order.subtotalAmountMinor.toString(),
        discountMinor: sale.order.discountAmountMinor.toString(),
        amountPaidMinor: sale.order.totalAmountMinor.toString(),
        currency: sale.order.currency,
      },
      details: details.get(sale.userId) ?? {},
    }));
  }

  // --- internals --------------------------------------------------------------

  /** Reads and checks every row, and works out what each would do. */
  private async prepare(productId: string, raw: unknown) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, title: true, type: true, priceAmountMinor: true, currency: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const handler = this.handlers.for(product.type);
    if (!handler) {
      throw new BadRequestException('Buyers cannot be added by hand to this kind of product yet.');
    }

    const parsed = parseOfflineSaleRows(raw, new Date());
    const errors: OfflineSaleRowError[] = [...parsed.errors];

    // The product type's own answers. A row that fails here keeps its place
    // in `errors`, like any other mistake.
    const rows: OfflineSaleRow[] = [];
    for (const row of parsed.rows) {
      const checked = handler.validateDetails(row.details);
      for (const message of checked.errors) errors.push({ index: row.index, field: 'details', message });
      rows.push({ ...row, details: checked.details });
    }

    const users = await this.prisma.user.findMany({
      where: { email: { in: rows.map((row) => row.email) } },
      select: {
        id: true,
        email: true,
        name: true,
        entitlements: { where: { productId, status: EntitlementStatus.ACTIVE }, select: { id: true } },
      },
    });
    const byEmail = new Map(users.map((user) => [user.email!.toLowerCase(), user]));

    // A Razorpay payment id may back one order only (payments.provider_payment_id
    // is unique). Already recorded for this same buyer, who still has the seat,
    // is just the list being sent again — that row is skipped, not an error.
    const paymentIds = rows
      .filter((row) => row.method === OfflinePaymentMethod.RAZORPAY_PAYMENT_PAGE && row.reference)
      .map((row) => row.reference!);
    const taken =
      paymentIds.length === 0
        ? []
        : await this.prisma.payment.findMany({
            where: { providerPaymentId: { in: paymentIds } },
            select: { providerPaymentId: true, order: { select: { orderNumber: true, user: { select: { email: true } } } } },
          });
    for (const payment of taken) {
      const row = rows.find((r) => r.reference === payment.providerPaymentId)!;
      const sameBuyerSeated =
        payment.order.user.email?.toLowerCase() === row.email &&
        (byEmail.get(row.email)?.entitlements.length ?? 0) > 0;
      if (sameBuyerSeated) continue;
      errors.push({
        index: row.index,
        field: 'reference',
        message: `${payment.providerPaymentId} is already recorded on order ${payment.order.orderNumber}.`,
      });
    }

    const plan: OfflineSalePlanRow[] = rows.map((row) => {
      const existing = byEmail.get(row.email);
      return {
        index: row.index,
        name: row.name,
        email: row.email,
        whatsappNumber: row.whatsappNumber,
        amountPaidMinor: row.amountPaidMinor.toString(),
        discountMinor: row.discountMinor.toString(),
        method: row.method,
        reference: row.reference,
        note: row.note,
        paidAt: row.paidAt.toISOString(),
        details: row.details,
        action: !existing ? 'create' : existing.entitlements.length > 0 ? 'skip' : 'attach',
        existingName: existing?.name ?? null,
      };
    });

    errors.sort((a, b) => a.index - b.index);

    return {
      product: {
        id: product.id,
        title: product.title,
        type: product.type,
        priceAmountMinor: product.priceAmountMinor.toString(),
        currency: product.currency,
      },
      handler,
      plan,
      errors,
    };
  }

  /** One buyer, one transaction. Returns the order number, or null if they turned out to have access already. */
  private async recordOne(
    tx: Prisma.TransactionClient,
    input: {
      product: { id: string; title: string; type: OfflineSaleHandler['productType']; currency: string };
      handler: OfflineSaleHandler;
      bundle: Array<{ childProductId: string }>;
      row: OfflineSalePlanRow;
      actor: OfflineSaleActor;
    },
  ): Promise<string | null> {
    const { product, handler, bundle, row, actor } = input;
    const paidAt = new Date(row.paidAt);
    const paid = BigInt(row.amountPaidMinor);
    const discount = BigInt(row.discountMinor);
    const listPrice = paid + discount;

    // Checked again here: the preview was a moment ago, and someone may have
    // bought on the website since.
    let user = await tx.user.findUnique({
      where: { email: row.email },
      select: { id: true, contactPhone: true },
    });
    if (user) {
      const seat = await tx.entitlement.findFirst({
        where: { userId: user.id, productId: product.id, status: EntitlementStatus.ACTIVE },
        select: { id: true },
      });
      if (seat) return null;

      // The number they gave becomes the account's mobile number — where the
      // profile form puts it — unless they have already typed one in themselves.
      if (row.whatsappNumber && !user.contactPhone) {
        await tx.user.update({ where: { id: user.id }, data: { contactPhone: row.whatsappNumber } });
      }
    } else {
      const student = await tx.role.findUnique({ where: { key: 'STUDENT' }, select: { id: true } });
      if (!student) throw new Error('No STUDENT role — the database has not been seeded');

      user = await tx.user.create({
        data: {
          email: row.email,
          name: row.name,
          // Unverified on purpose: nothing here proves they control the
          // address. It is claimed when they sign up with it (by Google, or by
          // setting a password — see AccountRecoveryService).
          emailVerifiedAt: null,
          // `contactPhone`, never `phone`: that one is a verified, unique
          // sign-in identifier, and an unchecked number there could block its
          // real owner from claiming it.
          contactPhone: row.whatsappNumber,
          roles: { create: { roleId: student.id } },
        },
        select: { id: true, contactPhone: true },
      });
    }

    const orderNumber = await nextOrderNumber(tx);
    const order = await tx.order.create({
      data: {
        orderNumber,
        userId: user.id,
        status: OrderStatus.PAID,
        // orders_total_is_consistent: total = subtotal - discount + tax.
        subtotalAmountMinor: listPrice,
        discountAmountMinor: discount,
        taxAmountMinor: 0n,
        totalAmountMinor: paid,
        currency: product.currency,
        customerEmail: row.email,
        customerPhone: row.whatsappNumber,
        createdAt: paidAt,
        paidAt,
        notes: { offlineSale: true } as Prisma.InputJsonValue,
        items: {
          create: {
            productId: product.id,
            productTitleSnapshot: product.title,
            productTypeSnapshot: product.type,
            // order_items_amounts_valid: total = unit × quantity. The discount
            // is the order's, as a coupon's would be.
            unitPriceAmountMinor: listPrice,
            quantity: 1,
            totalAmountMinor: listPrice,
          },
        },
      },
      select: { id: true },
    });

    const viaRazorpay = row.method === OfflinePaymentMethod.RAZORPAY_PAYMENT_PAGE;
    await tx.payment.create({
      data: {
        orderId: order.id,
        // A Payment Page payment is a real Razorpay payment: with its pay_ id
        // recorded, a refund issued in the Razorpay dashboard finds this order
        // and takes the access back. Anything else has no provider to ask.
        provider: viaRazorpay ? PaymentProvider.RAZORPAY : PaymentProvider.OFFLINE,
        providerOrderId: null,
        providerPaymentId: viaRazorpay ? row.reference : null,
        status: PaymentStatus.CAPTURED,
        method: PAYMENT_METHOD_LABEL[row.method],
        amountMinor: paid,
        currency: product.currency,
        createdAt: paidAt,
        capturedAt: paidAt,
      },
    });

    await this.entitlements.grant(
      {
        userId: user.id,
        productId: product.id,
        source: EntitlementSource.PURCHASE,
        sourceOrderId: order.id,
        grantedAt: paidAt,
      },
      tx,
    );

    // Included products, exactly as settlement grants them: tied to the order
    // so a refund takes them back, and only when the product type grants them
    // at payment (a session may hold its PDF back until it has ended).
    if (await handler.grantsIncludedItemsNow(product.id, tx)) {
      for (const included of bundle) {
        // A PDF bundle brings its PDFs with it.
        await this.entitlements.grantWithContents(
          {
            userId: user.id,
            productId: included.childProductId,
            source: EntitlementSource.BUNDLE,
            sourceOrderId: order.id,
            sourceProductId: product.id,
            grantedAt: paidAt,
          },
          tx,
        );
      }
    }

    await tx.offlineSale.create({
      data: {
        orderId: order.id,
        productId: product.id,
        userId: user.id,
        method: row.method,
        reference: row.reference,
        note: row.note,
        paidAt,
        entry: actor.entry,
        recordedById: actor.userId,
      },
    });

    await handler.apply(
      {
        productId: product.id,
        userId: user.id,
        orderId: order.id,
        paidAt,
        whatsappNumber: row.whatsappNumber,
        details: row.details,
      },
      tx,
    );

    await this.audit.record(
      {
        actorUserId: actor.userId,
        action: 'offline_sale.recorded',
        entityType: 'order',
        entityId: order.id,
        after: {
          orderNumber,
          productId: product.id,
          userId: user.id,
          email: row.email,
          amountPaidMinor: paid,
          discountMinor: discount,
          method: row.method,
          reference: row.reference,
          paidAt,
          entry: actor.entry,
        },
        ip: actor.ip ?? null,
      },
      tx,
    );

    return orderNumber;
  }
}

function failureReason(cause: unknown): string {
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    return 'Someone else recorded this buyer or payment at the same moment. Check the list, then try again.';
  }
  return 'Could not be recorded. Nothing was saved for this buyer; try again.';
}
