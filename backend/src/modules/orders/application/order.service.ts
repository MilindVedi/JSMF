import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessType,
  EntitlementSource,
  EntitlementStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  ProductType,
  RefundStatus,
} from '@prisma/client';
import { readPyqPlan } from '../../../shared/pyq-plan';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { PaymentProvider } from '../../payments/domain/payment-provider.port';
import { bundlePayableMinor } from '../domain/bundle-price';
import { nextOrderNumber } from '../domain/order-number';

export interface CheckoutRequest {
  userId: string;
  productId: string;
  /** Null for a buyer who signed up with a mobile number and has no email. */
  customerEmail: string | null;
  customerPhone?: string | null;
  /**
   * Which product types this checkout may sell. Defaults to the storefront's
   * catalogue. A live session is excluded unless its own module asks for it,
   * because that module is what checks seats and the start time first — the
   * generic `/orders` route selling one would skip both.
   */
  allowedTypes?: ProductType[];
}

const STOREFRONT_TYPES: ProductType[] = [
  ProductType.PDF,
  ProductType.VIDEO,
  ProductType.COURSE,
  ProductType.BUNDLE,
];

export type CheckoutResult =
  | {
      kind: 'FREE';
      orderId: string;
      orderNumber: string;
      productId: string;
    }
  | {
      kind: 'PAYMENT_REQUIRED';
      orderId: string;
      orderNumber: string;
      amountMinor: bigint;
      currency: string;
      providerOrderId: string;
      /** Publishable key for the browser widget. Never the secret. */
      checkoutKeyId: string;
    };

/** What one person would pay for a bundle, and why. */
export interface BundleQuote {
  productId: string;
  priceMinor: string;
  payMinor: string;
  totalPdfs: number;
  /** The bundle's PDFs this person already holds, in bundle order. */
  owned: Array<{ id: string; title: string; free: boolean }>;
  /**
   * The price is shared across the bundle's paid PDFs only, and only those
   * already held take money off: a free PDF anyone can claim must not be a
   * way to a cheaper bundle.
   */
  paidPdfs: number;
  paidOwned: number;
  /** True when they hold the bundle itself, or every PDF in it: nothing to buy. */
  nothingToBuy: boolean;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentProvider,
    private readonly entitlements: EntitlementService,
  ) {}

  /**
   * Starts a checkout.
   *
   * The governing rule is that **the price is read from the database and never
   * from the request**. A client that posts an amount is ignored — there is no
   * field for it in the input — so the classic "edit the price in devtools"
   * attack has nothing to attach to.
   */
  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    const product = await this.prisma.product.findFirst({
      where: {
        id: request.productId,
        status: ProductStatus.PUBLISHED,
        // Not in the store means not for sale either: a session handout is
        // given to seat holders, never bought or claimed on its own.
        listed: true,
        deletedAt: null,
        type: { in: request.allowedTypes ?? STOREFRONT_TYPES },
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.entitlements.findActive(request.userId, product.id);
    // A PYQ plan is the one product bought again while still owned: the
    // renewal extends the expiry at settlement instead of granting twice.
    if (existing && !readPyqPlan(product.metadata)) {
      throw new ConflictException('You already own this product.');
    }

    if (product.type === ProductType.BUNDLE) {
      const quote = await this.bundleQuote(request.userId, product.id);
      if (quote.totalPdfs === 0) throw new ConflictException('This bundle has no PDFs in it yet.');
      if (quote.nothingToBuy) throw new ConflictException('You already have every PDF in this bundle.');
      const pay = BigInt(quote.payMinor);
      // Free, or every remaining PDF rounds to nothing: no payment to take.
      if (product.accessType === AccessType.FREE || pay === 0n) {
        return this.claimFree(request, product, product.accessType === AccessType.FREE ? 0n : product.priceAmountMinor);
      }
      return this.startPaidCheckout(request, product, pay);
    }

    return product.accessType === AccessType.FREE
      ? this.claimFree(request, product)
      : this.startPaidCheckout(request, product);
  }

  /**
   * The price of a bundle for one person: the paid PDFs in it they already
   * hold are taken off, pro rata by count (see bundlePayableMinor). Free PDFs
   * neither count nor take anything off. Read again at checkout, so a quote
   * shown on the page is never what is charged.
   */
  async bundleQuote(userId: string | null, productId: string): Promise<BundleQuote> {
    const bundle = await this.prisma.product.findFirst({
      where: { id: productId, type: ProductType.BUNDLE, deletedAt: null },
      select: {
        id: true,
        priceAmountMinor: true,
        accessType: true,
        bundleItems: {
          where: { child: { deletedAt: null } },
          orderBy: { sortOrder: 'asc' },
          select: { child: { select: { id: true, title: true, accessType: true } } },
        },
      },
    });
    if (!bundle) throw new NotFoundException('Product not found');

    const children = bundle.bundleItems.map((item) => item.child);
    const price = bundle.accessType === AccessType.FREE ? 0n : bundle.priceAmountMinor;
    const heldIds = userId
      ? new Set(
          (
            await this.prisma.entitlement.findMany({
              where: {
                userId,
                status: EntitlementStatus.ACTIVE,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                productId: { in: [bundle.id, ...children.map((c) => c.id)] },
              },
              select: { productId: true },
            })
          ).map((e) => e.productId),
        )
      : new Set<string>();
    const owned = children.filter((c) => heldIds.has(c.id));
    const paid = children.filter((c) => c.accessType !== AccessType.FREE);
    const paidOwned = paid.filter((c) => heldIds.has(c.id)).length;

    return {
      productId: bundle.id,
      priceMinor: price.toString(),
      payMinor: bundlePayableMinor(price, paid.length, paidOwned).toString(),
      totalPdfs: children.length,
      owned: owned.map(({ id, title, accessType }) => ({ id, title, free: accessType === AccessType.FREE })),
      paidPdfs: paid.length,
      paidOwned,
      nothingToBuy: heldIds.has(bundle.id) || (children.length > 0 && owned.length === children.length),
    };
  }

  /**
   * A free product still produces a real order.
   *
   * It would be simpler to grant the entitlement and skip the order entirely,
   * but then "everything this person acquired" would live in two places with
   * different shapes, and making a free product paid later would leave a hole
   * in its history. One order shape for both is cheaper than reconciling two.
   */
  private async claimFree(
    request: CheckoutRequest,
    product: { id: string; title: string; type: never | string; currency: string },
    // A bundle whose remaining PDFs round to ₹0: the order still says what
    // the bundle costs, all of it as discount.
    listPriceMinor = 0n,
  ): Promise<CheckoutResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx);

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: request.userId,
          status: OrderStatus.PAID,
          // orders_total_is_consistent: total = subtotal - discount + tax.
          // 0 = 0 - 0 + 0 holds, so a free order satisfies the same arithmetic
          // constraint as a paid one rather than needing an exemption.
          subtotalAmountMinor: listPriceMinor,
          discountAmountMinor: listPriceMinor,
          taxAmountMinor: 0n,
          totalAmountMinor: 0n,
          currency: product.currency,
          customerEmail: request.customerEmail,
          customerPhone: request.customerPhone ?? null,
          paidAt: new Date(),
          items: {
            create: {
              productId: product.id,
              productTitleSnapshot: product.title,
              productTypeSnapshot: product.type as never,
              unitPriceAmountMinor: listPriceMinor,
              quantity: 1,
              totalAmountMinor: listPriceMinor,
            },
          },
        },
      });

      // A bundle brings its PDFs with it.
      await this.entitlements.grantWithContents(
        {
          userId: request.userId,
          productId: product.id,
          source: EntitlementSource.FREE_CLAIM,
          sourceOrderId: order.id,
        },
        tx,
      );

      return order;
    });

    return {
      kind: 'FREE',
      orderId: result.id,
      orderNumber: result.orderNumber,
      productId: product.id,
    };
  }

  private async startPaidCheckout(
    request: CheckoutRequest,
    product: {
      id: string;
      title: string;
      type: never | string;
      currency: string;
      priceAmountMinor: bigint;
    },
    // A bundle the buyer partly holds: less than the list price. The order
    // keeps the list price as its subtotal and the difference as a discount.
    payableMinor?: bigint,
  ): Promise<CheckoutResult> {
    const price = product.priceAmountMinor;
    const total = payableMinor ?? price;

    // The order row is created before the provider is contacted, so that a
    // provider order can never exist without a local record of what it was for.
    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx);

      return tx.order.create({
        data: {
          orderNumber,
          userId: request.userId,
          status: OrderStatus.CREATED,
          subtotalAmountMinor: price,
          discountAmountMinor: price - total,
          taxAmountMinor: 0n,
          totalAmountMinor: total,
          currency: product.currency,
          customerEmail: request.customerEmail,
          customerPhone: request.customerPhone ?? null,
          items: {
            // Snapshots: repricing the product tomorrow must not rewrite what
            // this invoice says was charged today.
            create: {
              productId: product.id,
              productTitleSnapshot: product.title,
              productTypeSnapshot: product.type as never,
              unitPriceAmountMinor: price,
              quantity: 1,
              totalAmountMinor: price,
            },
          },
        },
      });
    });

    let providerOrder: Awaited<ReturnType<PaymentProvider['createOrder']>>;
    try {
      providerOrder = await this.payments.createOrder({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amountMinor: order.totalAmountMinor,
        currency: order.currency,
        customerEmail: order.customerEmail,
      });
    } catch (error) {
      // The buyer sees "could not start the payment"; this is the line that
      // says why — wrong keys, Razorpay down, a network timeout.
      activity(
        this.logger,
        'checkout.provider_error',
        {
          orderNumber: order.orderNumber,
          userId: request.userId,
          productId: product.id,
          reason: error instanceof Error ? error.message : String(error),
        },
        'error',
      );
      throw error;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: providerOrder.provider,
          providerOrderId: providerOrder.providerOrderId,
          status: PaymentStatus.CREATED,
          amountMinor: order.totalAmountMinor,
          currency: order.currency,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.AWAITING_PAYMENT },
      });
    });

    activity(this.logger, 'checkout.started', {
      orderNumber: order.orderNumber,
      orderId: order.id,
      userId: request.userId,
      productId: product.id,
      productType: product.type,
      amountMinor: order.totalAmountMinor,
      currency: order.currency,
      provider: providerOrder.provider,
      providerOrderId: providerOrder.providerOrderId,
    });

    return {
      kind: 'PAYMENT_REQUIRED',
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountMinor: order.totalAmountMinor,
      currency: order.currency,
      providerOrderId: providerOrder.providerOrderId,
      checkoutKeyId: providerOrder.checkoutKeyId,
    };
  }

  listForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        payments: {
          select: { id: true, provider: true, status: true, method: true, capturedAt: true },
        },
      },
    });
  }

  async findForUser(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true, payments: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Every order, any customer — the admin-wide view `listForUser` deliberately isn't. */
  async listForAdmin(query: {
    status?: OrderStatus;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const where: Prisma.OrderWhereInput = {
      status: query.status,
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { customerEmail: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: true,
          payments: {
            select: {
              id: true,
              provider: true,
              status: true,
              method: true,
              capturedAt: true,
              amountMinor: true,
              providerOrderId: true,
              providerPaymentId: true,
            },
          },
          refunds: { orderBy: { createdAt: 'asc' } },
          user: { select: { id: true, name: true, email: true } },
          entitlements: ACTIVE_ACCESS,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items: items.map(withRefundState), total, page, pageSize };
  }

  async findForAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: true,
        refunds: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, name: true, email: true } },
        entitlements: ACTIVE_ACCESS,
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    return withRefundState(order);
  }
}

/** Enough to say whether an order still gives access to anything. */
const ACTIVE_ACCESS = { where: { status: EntitlementStatus.ACTIVE }, select: { id: true }, take: 1 } as const;

/**
 * What the admin refund screen needs, worked out once here so the page never
 * does money arithmetic of its own: how much has gone back, how much is left,
 * whether Razorpay can still do it, and whether the order still gives access.
 */
function withRefundState<
  T extends {
    payments: Array<{
      status: PaymentStatus;
      amountMinor: bigint;
      providerOrderId: string | null;
      providerPaymentId: string | null;
    }>;
    refunds: Array<{ status: RefundStatus; amountMinor: bigint }>;
    entitlements: Array<{ id: string }>;
  },
>(order: T) {
  const { entitlements, ...rest } = order;
  const payment = order.payments.find(
    (p) => p.status === PaymentStatus.CAPTURED || p.status === PaymentStatus.REFUNDED,
  );
  const refundedMinor = order.refunds
    .filter((refund) => refund.status !== RefundStatus.FAILED)
    .reduce((sum, refund) => sum + refund.amountMinor, 0n);
  const capturedMinor = payment?.amountMinor ?? 0n;
  const refundableMinor =
    payment?.status === PaymentStatus.CAPTURED && capturedMinor > refundedMinor ? capturedMinor - refundedMinor : 0n;

  return {
    ...rest,
    refundedMinor,
    refundableMinor,
    /** False for money that never went through Razorpay (a direct UPI transfer recorded by hand). */
    refundableThroughProvider:
      refundableMinor > 0n && payment !== undefined && (payment.providerPaymentId !== null || payment.providerOrderId !== null),
    hasAccess: entitlements.length > 0,
  };
}
