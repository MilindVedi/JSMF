import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessType,
  EntitlementSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { PaymentProvider } from '../../payments/domain/payment-provider.port';

export interface CheckoutRequest {
  userId: string;
  productId: string;
  customerEmail: string;
  customerPhone?: string | null;
}

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
        deletedAt: null,
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.entitlements.findActive(request.userId, product.id);
    if (existing) {
      throw new ConflictException('You already own this product.');
    }

    return product.accessType === AccessType.FREE
      ? this.claimFree(request, product)
      : this.startPaidCheckout(request, product);
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
  ): Promise<CheckoutResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextOrderNumber(tx);

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: request.userId,
          status: OrderStatus.PAID,
          // orders_total_is_consistent: total = subtotal - discount + tax.
          // 0 = 0 - 0 + 0 holds, so a free order satisfies the same arithmetic
          // constraint as a paid one rather than needing an exemption.
          subtotalAmountMinor: 0n,
          discountAmountMinor: 0n,
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
              unitPriceAmountMinor: 0n,
              quantity: 1,
              totalAmountMinor: 0n,
            },
          },
        },
      });

      await this.entitlements.grant(
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
  ): Promise<CheckoutResult> {
    const price = product.priceAmountMinor;

    // The order row is created before the provider is contacted, so that a
    // provider order can never exist without a local record of what it was for.
    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextOrderNumber(tx);

      return tx.order.create({
        data: {
          orderNumber,
          userId: request.userId,
          status: OrderStatus.CREATED,
          subtotalAmountMinor: price,
          discountAmountMinor: 0n,
          taxAmountMinor: 0n,
          totalAmountMinor: price,
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

    const providerOrder = await this.payments.createOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountMinor: order.totalAmountMinor,
      currency: order.currency,
      customerEmail: order.customerEmail,
    });

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

    this.logger.log(
      `Checkout started: order ${order.orderNumber} → ${providerOrder.providerOrderId}`,
    );

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
            select: { id: true, provider: true, status: true, method: true, capturedAt: true },
          },
          refunds: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findForAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: true,
        refunds: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * `JSMF-2026-000412`, from a Postgres sequence.
   *
   * Not `max(order_number) + 1`: two checkouts in the same instant would read
   * the same maximum and one would then collide on the UNIQUE constraint. A
   * sequence is contention-free and needs no retry loop. Gaps from rolled-back
   * transactions are fine — this is an identifier to read aloud in support, not
   * a count of orders.
   */
  private async nextOrderNumber(tx: {
    $queryRaw: PrismaService['$queryRaw'];
  }): Promise<string> {
    const [row] = await tx.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('order_number_seq') AS nextval
    `;

    return `JSMF-${new Date().getFullYear()}-${String(row.nextval).padStart(6, '0')}`;
  }
}
