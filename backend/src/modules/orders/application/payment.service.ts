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
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MailService } from '../../../shared/mail/application/mail.service';
import { WhatsAppService } from '../../../shared/whatsapp/application/whatsapp.service';
import { purchaseConfirmation } from '../../../shared/mail/templates/mail-templates';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OrderEvents, type OrderPaidEvent } from './order-events';
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

/** What a receipt needs, captured while the order row is in hand. */
interface PurchaseConfirmationContext {
  email: string | null;
  /** The buyer's *verified* mobile number, when they have one. */
  phone: string | null;
  name: string;
  items: Array<{ title: string }>;
  totalAmountMinor: bigint;
  currency: string;
  orderNumber: string;
  paymentId: string;
}

/**
 * Minor units to a displayable amount — 19900 becomes "₹199".
 *
 * Money is stored in minor units precisely so it is never a float, so the
 * conversion is done with integer arithmetic rather than by dividing: dividing
 * a bigint by 100 in JavaScript would either truncate the paise or force a
 * float back into the one place the schema went to trouble to avoid one.
 *
 * Whole amounts drop the ".00", because "₹199" is how a price is written and
 * "₹199.00" reads like an accounting system.
 */
/**
 * The items on one line, for a channel that has no room for a list.
 *
 * WhatsApp template parameters cannot contain newlines at all — Meta rejects
 * the message rather than trimming it — so a bulleted list is not an option
 * here even though the email uses one. Long orders are summarised rather than
 * truncated mid-title, because "Pathology Revision Notes, Surgery Q… " reads
 * like a broken message where "and 2 more" reads like a summary.
 */
function summariseItems(items: Array<{ title: string }>): string {
  const titles = items.map((item) => item.title);
  if (titles.length <= 2) return titles.join(' and ');
  return `${titles.slice(0, 2).join(', ')} and ${titles.length - 2} more`;
}

function formatMoney(amountMinor: bigint, currency: string): string {
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const major = absolute / 100n;
  const minor = absolute % 100n;

  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  const amount = minor === 0n ? `${major}` : `${major}.${minor.toString().padStart(2, '0')}`;

  return `${negative ? '-' : ''}${symbol}${amount}`;
}

/**
 * "Nikhil Sharma" -> "Nikhil". A confirmation opens with a greeting, and a
 * greeting uses the name someone is called, not their full legal name.
 */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly entitlements: EntitlementService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsAppService,
    private readonly config: AppConfig,
    private readonly events: OrderEvents,
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

    // Set inside the transaction, used after it commits. The confirmation email
    // must be sent once per purchase, not once per caller — `settle` is invoked
    // by the browser callback, the webhook (which the provider retries) and the
    // reconciliation sweep, all of which can land on the same order. Only the
    // call that actually moves the order into PAID has anything new to
    // announce; the rest are no-ops and must stay silent.
    let confirmation: PurchaseConfirmationContext | null = null;
    let paidEvent: OrderPaidEvent | null = null;

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { providerOrderId: input.providerOrderId },
        include: {
          order: {
            include: {
              user: true,
              items: {
                include: {
                  product: {
                    select: {
                      bundleItems: {
                        where: { child: { deletedAt: null } },
                        select: { childProductId: true },
                        orderBy: { sortOrder: 'asc' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
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

        confirmation = {
          // The order's snapshot, not the user's current address: a buyer who
          // later changes their email should not retroactively change where a
          // past purchase was confirmed to.
          email: payment.order.customerEmail,
          // The account's verified number, not `order.customerPhone`. That
          // column can hold a number typed into the checkout form, which
          // nobody has proved they control — and a receipt naming what someone
          // bought should not be sent to an unverified number, which a typo
          // makes a stranger's.
          phone: payment.order.user.phoneVerifiedAt ? payment.order.user.phone : null,
          name: payment.order.user.name,
          items: payment.order.items.map((item) => ({ title: item.productTitleSnapshot })),
          totalAmountMinor: payment.order.totalAmountMinor,
          currency: payment.order.currency,
          orderNumber: payment.order.orderNumber,
          paymentId: input.providerPaymentId,
        };

        paidEvent = {
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          userId: payment.order.userId,
          customerEmail: payment.order.customerEmail,
          customerName: payment.order.user.name,
          items: payment.order.items.map((item) => ({
            productId: item.productId,
            productType: item.productTypeSnapshot,
            title: item.productTitleSnapshot,
          })),
          totalAmountMinor: payment.order.totalAmountMinor,
          currency: payment.order.currency,
          paymentId: input.providerPaymentId,
        };
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

        // Products included with this one — a live session's free revision
        // planner. Carrying `sourceOrderId` is what makes a refund take them
        // back along with the session (revokeForOrder), and granting is
        // idempotent, so a buyer who already owns the planner keeps the copy
        // they bought and this adds nothing.
        for (const included of item.product.bundleItems) {
          await this.entitlements.grant(
            {
              userId: payment.order.userId,
              productId: included.childProductId,
              source: EntitlementSource.BUNDLE,
              sourceOrderId: payment.orderId,
              sourceProductId: item.productId,
            },
            tx,
          );
        }
      }
    });

    this.logger.log(`Settled ${input.providerOrderId} via ${input.source}`);

    // After the commit, never inside it: an open transaction holds a database
    // connection, and this makes an HTTP call to the mail provider. It is also
    // the only correct order — the email says the purchase succeeded, so it
    // must not go out until that is durably true.
    if (confirmation && paidEvent) {
      const { confirmationHandled } = await this.events.paid(paidEvent);
      if (!confirmationHandled) await this.sendPurchaseConfirmation(confirmation);
    }
  }

  /**
   * Best-effort by design, and the one place in this service where a failure is
   * deliberately swallowed.
   *
   * The money has been taken and the entitlement granted by the time this runs.
   * Refusing the settlement because a receipt bounced would turn a completed
   * purchase into an error the buyer cannot act on — one they have already paid
   * for — and would leave the webhook retrying an operation that has, in every
   * way that matters, already worked. The library is the source of truth for
   * access; the receipt is a courtesy on top of it.
   *
   * **One receipt, not two.** Email when there is an address, WhatsApp when
   * there is only a verified number. Buyers with both are not messaged twice:
   * a second copy of the same receipt is an annoyance that also costs money per
   * message, and email is the better carrier for something worth keeping.
   */
  private async sendPurchaseConfirmation(context: PurchaseConfirmationContext): Promise<void> {
    if (context.email) {
      await this.emailReceipt(context, context.email);
      return;
    }

    if (context.phone && this.whatsapp.enabled()) {
      await this.whatsAppReceipt(context, context.phone);
      return;
    }

    this.logger.log(
      `Order ${context.orderNumber} paid by a buyer with no email` +
        `${context.phone ? ' and WhatsApp not configured' : ' or verified mobile number'}; ` +
        `no receipt sent. The purchase is complete and the entitlement is granted.`,
    );
  }

  private async emailReceipt(context: PurchaseConfirmationContext, email: string): Promise<void> {
    const rendered = purchaseConfirmation({
      buyerName: firstName(context.name),
      items: context.items,
      totalFormatted: formatMoney(context.totalAmountMinor, context.currency),
      orderNumber: context.orderNumber,
      paymentId: context.paymentId,
      libraryUrl: this.libraryUrl(),
    });

    const outcome = await this.mail.sendBestEffort({
      to: { email, name: context.name },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag: 'purchase-confirmation',
    });

    if (!outcome.delivered) this.receiptNotDelivered(context, 'email', outcome.reason);
  }

  /**
   * The same receipt for a buyer who has only a mobile number.
   *
   * Deliberately shorter than the email. WhatsApp wording is fixed by the
   * approved template and read on a phone, so it carries what the buyer needs
   * to recognise the purchase — what, how much, which order — and leaves the
   * payment id to the email, where it is a support reference rather than
   * something to read. The template's button links to the library, exactly as
   * the email does.
   */
  private async whatsAppReceipt(context: PurchaseConfirmationContext, phone: string): Promise<void> {
    const outcome = await this.whatsapp.send({
      to: phone,
      message: {
        kind: 'purchase-receipt',
        buyerName: firstName(context.name),
        items: summariseItems(context.items),
        totalFormatted: formatMoney(context.totalAmountMinor, context.currency),
        orderNumber: context.orderNumber,
        // The same destination the email links to — the library, never a
        // direct download. A download URL is signed and short-lived, and a
        // forwarded message would hand it to whoever received it.
        libraryUrl: this.libraryUrl(),
      },
      tag: 'purchase-confirmation',
    });

    if (!outcome.delivered) this.receiptNotDelivered(context, 'WhatsApp', outcome.reason);
  }

  /**
   * Logged against the order number rather than left to the provider's own log,
   * so "the buyer says they got nothing" is answerable from the order.
   */
  private receiptNotDelivered(
    context: PurchaseConfirmationContext,
    channel: string,
    reason: string,
  ): void {
    this.logger.warn(
      `Purchase receipt not delivered by ${channel} for ${context.orderNumber} (${reason}) — ` +
        `the purchase itself is complete and the entitlement is granted`,
    );
  }

  /**
   * Where the buyer's files are, for both the email and the WhatsApp receipt.
   *
   * `STOREFRONT_URL`, not `APP_PUBLIC_URL` — the latter is this API's own base
   * URL and ends in `/api`, so it produced links to `…/api/library`, a page
   * that has never existed.
   */
  private libraryUrl(): string {
    return `${this.config.get('STOREFRONT_URL').replace(/\/$/, '')}/library`;
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
