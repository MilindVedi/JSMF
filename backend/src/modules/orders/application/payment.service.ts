import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EntitlementSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  WebhookEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import {
  PaymentProvider,
  type PaymentWebhookEvent,
} from '../../payments/domain/payment-provider.port';

export interface VerifyCheckoutRequest {
  userId: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly entitlements: EntitlementService,
  ) {}

  /**
   * The browser's post-payment callback.
   *
   * This exists to unlock the UI promptly, and it is deliberately **not** the
   * authority for granting access — the webhook is, because a user who closes
   * the tab after paying never sends this. Both paths converge on the same
   * `settle` call, and both are idempotent, because either can arrive first,
   * twice, or not at all.
   */
  async verifyCheckout(request: VerifyCheckoutRequest) {
    const valid = this.provider.verifyCheckoutSignature({
      providerOrderId: request.providerOrderId,
      providerPaymentId: request.providerPaymentId,
      signature: request.signature,
    });

    if (!valid) {
      this.logger.warn(
        `Invalid checkout signature for provider order ${request.providerOrderId}`,
      );
      throw new BadRequestException('Payment signature verification failed.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: request.providerOrderId },
      include: { order: { include: { items: true } } },
    });

    if (!payment) throw new NotFoundException('No payment found for that order.');

    // A valid signature proves the payment is genuine; it does not prove the
    // caller is the buyer. Without this check, anyone holding a signature could
    // settle someone else's order.
    if (payment.order.userId !== request.userId) {
      throw new NotFoundException('No payment found for that order.');
    }

    await this.settle({
      providerOrderId: request.providerOrderId,
      providerPaymentId: request.providerPaymentId,
      signature: request.signature,
      source: 'checkout-callback',
    });

    return { orderId: payment.orderId, status: OrderStatus.PAID };
  }

  /**
   * Handles a provider webhook.
   *
   * Returns whether the event was newly processed. An already-seen event is a
   * success, not an error — providers retry by design, and responding with a
   * failure would only make them retry harder.
   */
  async handleWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<{
    processed: boolean;
    duplicate: boolean;
  }> {
    const verification = this.provider.verifyWebhook(rawBody, headers);

    if (!verification.signatureValid) {
      // Deliberately NOT recorded. `provider_event_id` is UNIQUE and that
      // constraint is the entire idempotency mechanism — storing unverified
      // events would let anyone POST a forged event id and have the genuine
      // delivery dropped later as a duplicate, denying a paying customer what
      // they bought.
      this.logger.warn(`Rejected webhook: ${verification.reason}`);
      throw new BadRequestException('Invalid webhook signature.');
    }

    const event = verification.event;

    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: this.provider.name,
          providerEventId: event.eventId,
          eventType: event.eventType,
          payload: event.payload as Prisma.InputJsonValue,
          signatureValid: true,
          status: WebhookEventStatus.RECEIVED,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug(`Duplicate webhook ${event.eventId} ignored`);
        return { processed: false, duplicate: true };
      }
      throw error;
    }

    try {
      await this.process(event);

      await this.prisma.paymentWebhookEvent.update({
        where: { providerEventId: event.eventId },
        data: { status: WebhookEventStatus.PROCESSED, processedAt: new Date() },
      });

      return { processed: true, duplicate: false };
    } catch (error) {
      // The event row stays, marked FAILED with the reason, so a failure is
      // visible and replayable rather than vanishing into a log line.
      await this.prisma.paymentWebhookEvent.update({
        where: { providerEventId: event.eventId },
        data: {
          status: WebhookEventStatus.FAILED,
          processingError: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  private async process(event: PaymentWebhookEvent): Promise<void> {
    switch (event.normalizedType) {
      case 'PAYMENT_CAPTURED':
        if (!event.providerOrderId || !event.providerPaymentId) {
          throw new Error('Capture event is missing order or payment id');
        }
        await this.settle({
          providerOrderId: event.providerOrderId,
          providerPaymentId: event.providerPaymentId,
          method: event.method,
          amountMinor: event.amountMinor,
          raw: event.payload,
          source: 'webhook',
        });
        break;

      case 'PAYMENT_FAILED':
        await this.markFailed(event);
        break;

      // Authorized-but-not-captured grants nothing: the money has only been
      // held, not taken. Capture is the event that means paid.
      case 'PAYMENT_AUTHORIZED':
      case 'REFUND_PROCESSED':
      case 'IGNORED':
      default:
        this.logger.debug(`No action for event type ${event.eventType}`);
    }
  }

  /**
   * Marks an order paid and grants its entitlements, idempotently.
   *
   * Everything here is written so that running it twice is indistinguishable
   * from running it once: the payment update is conditional, and the
   * entitlement grant is protected by a partial unique index. That is what lets
   * the browser callback and the webhook both call it without coordination.
   */
  private async settle(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature?: string;
    method?: string;
    amountMinor?: bigint;
    raw?: unknown;
    source: string;
  }): Promise<void> {
    // Before the transaction, because it may have to call the provider: a
    // network round trip inside an open transaction would hold a database
    // connection for the length of an HTTP request.
    await this.ensurePaymentRecord(input.providerOrderId);

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { providerOrderId: input.providerOrderId },
        include: { order: { include: { items: true } } },
      });

      if (!payment) {
        throw new NotFoundException(
          `No payment recorded for provider order ${input.providerOrderId}`,
        );
      }

      // The amount is checked against what we recorded when the order was
      // created, never taken from the callback. A mismatch means the provider
      // order was not the one we made.
      if (input.amountMinor !== undefined && input.amountMinor !== payment.amountMinor) {
        throw new Error(
          `Amount mismatch on ${input.providerOrderId}: expected ${payment.amountMinor}, got ${input.amountMinor}`,
        );
      }

      if (payment.status !== PaymentStatus.CAPTURED) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            providerPaymentId: input.providerPaymentId,
            providerSignature: input.signature ?? payment.providerSignature,
            status: PaymentStatus.CAPTURED,
            method: input.method ?? payment.method,
            capturedAt: new Date(),
            rawResponse: (input.raw ?? payment.rawResponse) as Prisma.InputJsonValue,
          },
        });
      }

      if (payment.order.status !== OrderStatus.PAID) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.PAID, paidAt: new Date() },
        });
      }

      for (const item of payment.order.items) {
        await this.entitlements.grant(
          {
            userId: payment.order.userId,
            productId: item.productId,
            source: EntitlementSource.PURCHASE,
            sourceOrderId: payment.orderId,
          },
          tx,
        );
      }
    });

    this.logger.log(`Settled ${input.providerOrderId} via ${input.source}`);
  }

  /**
   * Guarantees there is a local `payments` row for a provider order, rebuilding
   * it from the provider if there is not.
   *
   * Checkout writes the order row, calls the provider, and only then writes the
   * `payments` row carrying the provider's order id. A crash in that last gap
   * leaves a provider order the buyer can pay against with nothing locally to
   * join it back to — and `settle` looks up by exactly that id, so the webhook
   * would fail permanently and the payment would be lost.
   *
   * The link is recoverable because `createOrder` writes our own order id into
   * the provider's `notes`, so the provider is holding the other half of it.
   */
  private async ensurePaymentRecord(providerOrderId: string): Promise<void> {
    const existing = await this.prisma.payment.findFirst({
      where: { providerOrderId },
      select: { id: true },
    });

    if (existing) return;

    this.logger.warn(
      `No payments row for provider order ${providerOrderId} — rebuilding it from the provider`,
    );

    const providerOrder = await this.provider.fetchOrder(providerOrderId);
    const localOrderId = providerOrder.notes?.jsmf_order_id;

    if (!localOrderId) {
      throw new NotFoundException(
        `Provider order ${providerOrderId} carries no jsmf_order_id and cannot be matched to an order`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // `provider_order_id` is indexed but not unique, so two settlements
      // arriving together (the webhook and the browser callback) could both
      // find nothing and both insert. Locking the order row first serialises
      // them; the second then sees the first one's row on re-check.
      const [order] = await tx.$queryRaw<
        { id: string; total_amount_minor: bigint; currency: string }[]
      >`
        SELECT id, total_amount_minor, currency
        FROM orders
        WHERE id = ${localOrderId}::uuid
        FOR UPDATE
      `;

      if (!order) {
        throw new NotFoundException(
          `Provider order ${providerOrderId} names order ${localOrderId}, which does not exist`,
        );
      }

      const raced = await tx.payment.findFirst({
        where: { providerOrderId },
        select: { id: true },
      });

      if (raced) return;

      // The amount comes from our own order, never the provider's copy. This
      // only asserts the two agree — if they do not, the provider order was not
      // the one we created for this order and nothing should be settled.
      if (providerOrder.amountMinor !== order.total_amount_minor) {
        throw new Error(
          `Amount mismatch rebuilding ${providerOrderId}: order ${localOrderId} totals ${order.total_amount_minor}, provider says ${providerOrder.amountMinor}`,
        );
      }

      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: this.provider.name,
          providerOrderId,
          status: PaymentStatus.CREATED,
          amountMinor: order.total_amount_minor,
          currency: order.currency,
        },
      });

      // Checkout sets this when it writes the payments row; if it never got
      // that far, the order is still sitting in CREATED.
      await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.CREATED },
        data: { status: OrderStatus.AWAITING_PAYMENT },
      });
    });

    this.logger.log(`Rebuilt the payments row for ${providerOrderId} from provider notes`);
  }

  /**
   * Asks the provider what actually happened to checkouts that never came back.
   *
   * The webhook is the authority for granting access, but it is delivered over
   * the network to a server that can be redeploying, unreachable, or configured
   * with the wrong signing secret — and if the buyer also closed the tab, the
   * browser callback never fires either. Nothing in the system would then
   * notice: the money is taken and the order sits in AWAITING_PAYMENT forever.
   *
   * This is the sweep that notices. It only ever *adds* a settlement the
   * provider says is owed; it never marks anything failed, because an order
   * with no payment attempt is the ordinary case of someone changing their mind
   * and is not a fault to record.
   */
  async reconcile(options: {
    staleAfterMinutes: number;
    giveUpAfterHours: number;
    batchSize: number;
  }): Promise<{ checked: number; settled: number; errors: number }> {
    const now = Date.now();

    const stale = await this.prisma.payment.findMany({
      where: {
        // Anything not yet terminal. CAPTURED, FAILED and REFUNDED are all
        // settled questions.
        status: { in: [PaymentStatus.CREATED, PaymentStatus.AUTHORIZED] },
        providerOrderId: { not: null },
        // Old enough that a webhook would normally have arrived, recent enough
        // that the provider still has it and a human would still care. Without
        // the lower bound this would re-query every abandoned checkout ever
        // made, every few minutes, forever.
        createdAt: {
          lt: new Date(now - options.staleAfterMinutes * 60_000),
          gt: new Date(now - options.giveUpAfterHours * 3_600_000),
        },
        order: { status: { in: [OrderStatus.CREATED, OrderStatus.AWAITING_PAYMENT] } },
      },
      orderBy: { createdAt: 'asc' },
      take: options.batchSize,
      select: { id: true, providerOrderId: true },
    });

    let settled = 0;
    let errors = 0;

    for (const payment of stale) {
      const providerOrderId = payment.providerOrderId;
      if (!providerOrderId) continue;

      try {
        const attempts = await this.provider.fetchPaymentsForOrder(providerOrderId);
        const captured = attempts.find((attempt) => attempt.status === 'CAPTURED');

        if (!captured) continue;

        this.logger.warn(
          `Reconciliation found an unsettled capture on ${providerOrderId} — settling it now`,
        );

        await this.settle({
          providerOrderId,
          providerPaymentId: captured.providerPaymentId,
          method: captured.method,
          amountMinor: captured.amountMinor,
          raw: captured.raw,
          source: 'reconciliation',
        });

        settled += 1;
      } catch (error) {
        // One unreachable order must not stop the sweep reaching the others.
        errors += 1;
        this.logger.error(
          `Reconciliation failed for ${providerOrderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (settled > 0 || errors > 0) {
      this.logger.log(
        `Reconciliation: ${stale.length} checked, ${settled} settled, ${errors} errored`,
      );
    }

    return { checked: stale.length, settled, errors };
  }

  private async markFailed(event: PaymentWebhookEvent): Promise<void> {
    if (!event.providerOrderId) return;

    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: event.providerOrderId },
    });

    if (!payment || payment.status === PaymentStatus.CAPTURED) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
          errorCode: event.errorCode,
          errorDescription: event.errorDescription,
          rawResponse: event.payload as Prisma.InputJsonValue,
        },
      });

      // The order stays FAILED rather than being deleted, so the user can see
      // the attempt and retry produces a new order rather than mutating this one.
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.FAILED },
      });
    });
  }

  /**
   * Full refund of a paid order, initiated by an admin.
   *
   * Always refunds the captured amount on record — never a client-supplied
   * figure — and revokes every entitlement the order granted in the same
   * transaction as the local bookkeeping, so a refund can never leave someone
   * with both their money back and the content. The call to the provider
   * happens first: if that fails, nothing local has changed yet to reconcile.
   */
  async refund(orderId: string, adminUserId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    const payment = order.payments.find((p) => p.status === PaymentStatus.CAPTURED);
    if (!payment) {
      throw new BadRequestException('This order has no captured payment to refund.');
    }

    if (order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException('This order has already been refunded.');
    }

    // Free orders (amount 0) settle without ever contacting the provider —
    // there is nothing to refund there, only the entitlement to revoke.
    const providerRefund =
      payment.amountMinor > 0n
        ? await this.provider.refund({
            providerPaymentId: payment.providerPaymentId ?? payment.providerOrderId ?? '',
            amountMinor: payment.amountMinor,
            reason,
          })
        : { providerRefundId: `free_${order.id}`, amountMinor: 0n, status: 'PROCESSED' as const, raw: null };

    await this.prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId: order.id,
          providerRefundId: providerRefund.providerRefundId,
          amountMinor: providerRefund.amountMinor,
          status: providerRefund.status as RefundStatus,
          reason,
          initiatedById: adminUserId,
          rawResponse: providerRefund.raw as Prisma.InputJsonValue,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.REFUNDED, cancelledAt: new Date() },
      });

      await this.entitlements.revokeForOrder(order.id, reason ?? 'Order refunded', tx);
    });

    this.logger.log(`Refunded order ${order.orderNumber} (${providerRefund.providerRefundId})`);

    return { orderId: order.id, status: OrderStatus.REFUNDED };
  }
}
