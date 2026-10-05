import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BundleDeliveryMode,
  EntitlementSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  WebhookEventStatus,
} from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MailService } from '../../../shared/mail/application/mail.service';
import { WhatsAppService } from '../../../shared/whatsapp/application/whatsapp.service';
import { purchaseConfirmation, refundConfirmation } from '../../../shared/mail/templates/mail-templates';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { extendedExpiry, readPyqPlan } from '../../../shared/pyq-plan';
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

/**
 * A provider order this application did not create — a Razorpay Payment Page
 * or payment link on the same account. Distinct from a real failure so the
 * webhook can acknowledge it rather than fail it.
 */
export class ForeignProviderOrderError extends Error {}

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
      activity(this.logger, 'payment.verify_rejected', {
        userId: request.userId,
        providerOrderId: request.providerOrderId,
        providerPaymentId: request.providerPaymentId,
        reason: 'invalid checkout signature',
      }, 'warn');
      throw new BadRequestException('Payment signature verification failed.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: request.providerOrderId },
      include: { order: { include: { items: true } } },
    });

    // A valid signature proves the payment is genuine; it does not prove the
    // caller is the buyer. Without this check, anyone holding a signature could
    // settle someone else's order.
    if (!payment || payment.order.userId !== request.userId) {
      activity(this.logger, 'payment.verify_rejected', {
        userId: request.userId,
        providerOrderId: request.providerOrderId,
        reason: payment ? 'order belongs to another user' : 'no payment for that provider order',
      }, 'warn');
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

    activity(this.logger, 'webhook.received', {
      eventId: event.eventId,
      eventType: event.eventType,
      providerOrderId: event.providerOrderId,
      providerPaymentId: event.providerPaymentId,
    });

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
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }

      // Seen before. Only a *processed* event is a true duplicate: one that
      // failed (or crashed mid-way and was left RECEIVED) must be retried,
      // because Razorpay's redelivery is the retry. Treating every repeat as
      // a duplicate meant a single transient failure — a database blip during
      // settlement — turned a paid order into one that was never settled, with
      // every redelivery politely answered "already handled".
      //
      // Reprocessing is safe: every handler below is idempotent.
      const seen = await this.prisma.paymentWebhookEvent.findUnique({
        where: { providerEventId: event.eventId },
        select: { status: true },
      });

      if (seen?.status === WebhookEventStatus.PROCESSED) {
        this.logger.debug(`Duplicate webhook ${event.eventId} ignored`);
        return { processed: false, duplicate: true };
      }

      this.logger.warn(
        `Webhook ${event.eventId} (${event.eventType}) redelivered after status ${seen?.status ?? 'unknown'} — retrying it`,
      );
    }

    try {
      await this.process(event);

      await this.prisma.paymentWebhookEvent.update({
        where: { providerEventId: event.eventId },
        data: { status: WebhookEventStatus.PROCESSED, processedAt: new Date(), processingError: null },
      });

      return { processed: true, duplicate: false };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      // The event row stays, marked FAILED with the reason, so a failure is
      // visible and replayable rather than vanishing into a log line — and
      // Razorpay's next redelivery retries it (see above).
      await this.prisma.paymentWebhookEvent.update({
        where: { providerEventId: event.eventId },
        data: { status: WebhookEventStatus.FAILED, processingError: reason },
      });

      activity(
        this.logger,
        'webhook.failed',
        { eventId: event.eventId, eventType: event.eventType, providerOrderId: event.providerOrderId, reason },
        'error',
      );

      throw error;
    }
  }

  private async process(event: PaymentWebhookEvent): Promise<void> {
    switch (event.normalizedType) {
      case 'PAYMENT_CAPTURED':
        if (!event.providerOrderId) {
          // A payment with no order at all was not made through our checkout
          // (every JSMF checkout creates a Razorpay order first).
          activity(this.logger, 'webhook.foreign_payment_ignored', {
            eventId: event.eventId,
            providerPaymentId: event.providerPaymentId,
            reason: 'no order id on the payment',
          }, 'warn');
          break;
        }
        if (!event.providerPaymentId) {
          throw new Error('Capture event is missing its payment id');
        }
        try {
          await this.settle({
            providerOrderId: event.providerOrderId,
            providerPaymentId: event.providerPaymentId,
            method: event.method,
            amountMinor: event.amountMinor,
            raw: event.payload,
            source: 'webhook',
          });
        } catch (error) {
          // The same Razorpay account also receives Payment Page / payment
          // link payments (the external-checkout phase), and every one of
          // them is sent to this webhook. They belong to no JSMF order, so
          // there is nothing to settle — answering 5xx would only make
          // Razorpay retry it, and repeated failures can get the whole
          // webhook disabled, which would take real settlements down with it.
          if (error instanceof ForeignProviderOrderError) {
            activity(this.logger, 'webhook.foreign_payment_ignored', {
              eventId: event.eventId,
              providerOrderId: event.providerOrderId,
              providerPaymentId: event.providerPaymentId,
              amountMinor: event.amountMinor,
              reason: error.message,
            }, 'warn');
            break;
          }
          throw error;
        }
        break;

      case 'PAYMENT_FAILED':
        await this.markFailed(event);
        break;

      case 'REFUND_PROCESSED':
        await this.applyProviderRefund(event);
        break;

      // Authorized-but-not-captured grants nothing: the money has only been
      // held, not taken. Capture is the event that means paid.
      case 'PAYMENT_AUTHORIZED':
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
    let settledOrder: { orderNumber: string; userId: string; amountMinor: bigint } | null = null;
    const planPurchases: Array<{ productId: string; expiresAt: Date; renewal: boolean }> = [];

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
                      // A live session may hold its included items back until
                      // after it has ended — see the grant loop below.
                      liveSession: { select: { bundleDeliveryMode: true } },
                      // A PYQ plan's duration lives here — see applyPlanTerm.
                      metadata: true,
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

      // Refunded already: a capture event replayed after the refund (a
      // redelivery, or the reconciliation sweep) must neither flip the payment
      // back to CAPTURED nor re-grant the access the refund took away.
      if (
        payment.status === PaymentStatus.REFUNDED ||
        payment.order.status === OrderStatus.REFUNDED ||
        payment.order.status === OrderStatus.PARTIALLY_REFUNDED
      ) {
        this.logger.warn(
          `Ignoring settlement of ${input.providerOrderId} via ${input.source}: order ${payment.order.orderNumber} is already refunded`,
        );
        return;
      }

      settledOrder = {
        orderNumber: payment.order.orderNumber,
        userId: payment.order.userId,
        amountMinor: payment.amountMinor,
      };

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

      // Conditional, and the row count decides who announces the purchase. The
      // webhook and the browser callback routinely arrive within milliseconds
      // of each other; reading the status first and updating after let both
      // see "not paid yet" and both send a confirmation. `updateMany` with the
      // status in its WHERE takes the row lock, so the second transaction
      // waits, re-evaluates against the committed PAID row, and matches 0.
      // A REFUNDED order is never moved back to PAID by a late capture event.
      const transitioned = await tx.order.updateMany({
        where: {
          id: payment.orderId,
          status: { notIn: [OrderStatus.PAID, OrderStatus.REFUNDED, OrderStatus.PARTIALLY_REFUNDED] },
        },
        data: { status: OrderStatus.PAID, paidAt: new Date() },
      });

      if (transitioned.count === 1) {
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
        const granted = await this.entitlements.grant(
          {
            userId: payment.order.userId,
            productId: item.productId,
            source: EntitlementSource.PURCHASE,
            sourceOrderId: payment.orderId,
          },
          tx,
        );

        // Only the call that moved the order to PAID may extend a plan, so a
        // redelivered webhook or the racing browser callback never adds days twice.
        if (transitioned.count === 1) {
          const term = await this.applyPlanTerm(tx, granted, item.product.metadata, payment.orderId);
          if (term) planPurchases.push({ productId: item.productId, ...term });
        }

        // A session whose included items are delivered after it ends grants
        // nothing here: the PDF frequently does not exist yet when seats go on
        // sale, and granting an entitlement to an unfinished product would put
        // a broken row in someone's library. LiveSessionNotifications releases
        // these later — on its own, or when an admin sends them.
        //
        // Only sessions can defer: `liveSession` is null for every other kind
        // of bundle, and those still grant immediately as they always have.
        const session = item.product.liveSession;
        if (session && session.bundleDeliveryMode !== BundleDeliveryMode.IMMEDIATE) {
          continue;
        }

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

    if (!settledOrder) return;
    // TypeScript narrows `let` bindings assigned inside a callback to `never`;
    // re-read through a typed alias so the fields are usable.
    const settled = settledOrder as { orderNumber: string; userId: string; amountMinor: bigint };

    activity(this.logger, 'payment.settled', {
      orderNumber: settled.orderNumber,
      userId: settled.userId,
      amountMinor: settled.amountMinor,
      providerOrderId: input.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      method: input.method,
      via: input.source,
      // false = another caller (the webhook or the browser callback) already
      // moved this order to PAID; this one changed nothing.
      firstSettlement: Boolean(confirmation),
    });

    for (const plan of planPurchases) {
      activity(this.logger, 'pyq.plan_purchased', {
        orderNumber: settled.orderNumber,
        userId: settled.userId,
        productId: plan.productId,
        expiresAt: plan.expiresAt.toISOString(),
        renewal: plan.renewal,
      });
    }

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
   * The subscription hook: when the product just paid for is a PYQ plan, set
   * the entitlement's expiry to `durationDays` from the later of now and its
   * current expiry (renewing early keeps the remaining days). The grant itself
   * stays the ordinary idempotent one; this only stamps a term on it.
   *
   * The renewed row is re-pointed at this order, so refunding the latest order
   * revokes the plan (refunds are all-or-nothing, as for every product).
   * A perpetual grant from elsewhere (an admin gift, expiresAt null on a row
   * this order did not create) is never shortened. Returns null for any
   * non-plan product, which is every product before subscriptions existed.
   */
  private async applyPlanTerm(
    tx: Prisma.TransactionClient,
    entitlement: { id: string; expiresAt: Date | null; sourceOrderId: string | null },
    metadata: unknown,
    orderId: string,
  ): Promise<{ expiresAt: Date; renewal: boolean } | null> {
    const plan = readPyqPlan(metadata);
    if (!plan) return null;

    const fresh = entitlement.sourceOrderId === orderId && entitlement.expiresAt === null;
    if (!fresh && entitlement.expiresAt === null) return null;

    const expiresAt = extendedExpiry(fresh ? null : entitlement.expiresAt, plan.durationDays);
    await tx.entitlement.update({
      where: { id: entitlement.id },
      data: { expiresAt, sourceOrderId: orderId },
    });
    return { expiresAt, renewal: !fresh };
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
      throw new ForeignProviderOrderError(
        `Provider order ${providerOrderId} carries no jsmf_order_id — not created by JSMF checkout`,
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
        // Anything not captured or refunded. FAILED is included on purpose:
        // Razorpay lets the buyer retry within the same order, so "the first
        // attempt failed" is followed by "the retry was captured" more often
        // than not — and if that capture's webhook never arrives and the
        // buyer closed the tab, this sweep is the only thing that notices.
        status: { in: [PaymentStatus.CREATED, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED] },
        providerOrderId: { not: null },
        // Old enough that a webhook would normally have arrived, recent enough
        // that the provider still has it and a human would still care. Without
        // the lower bound this would re-query every abandoned checkout ever
        // made, every few minutes, forever.
        createdAt: {
          lt: new Date(now - options.staleAfterMinutes * 60_000),
          gt: new Date(now - options.giveUpAfterHours * 3_600_000),
        },
        order: { status: { in: [OrderStatus.CREATED, OrderStatus.AWAITING_PAYMENT, OrderStatus.FAILED] } },
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

  /**
   * A refund the provider carried out that this application did not initiate.
   *
   * `refund()` below already revokes access in the same transaction as the
   * refund it starts, so this exists for the other door: a refund issued
   * directly in the Razorpay dashboard, which support will reach for because it
   * is right there. Without this, the money goes back and the buyer keeps the
   * content — the one outcome that costs twice.
   *
   * Partial refunds deliberately revoke nothing. Access here is all-or-nothing,
   * so taking it away for a partial return would leave someone who is still out
   * of pocket with less than they paid for; only refunds that together cover
   * the captured amount remove it.
   */
  private async applyProviderRefund(event: PaymentWebhookEvent): Promise<void> {
    if (!event.providerRefundId || !event.providerPaymentId) {
      throw new Error('Refund event is missing its refund or payment id');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { providerPaymentId: event.providerPaymentId },
      select: { id: true, orderId: true, amountMinor: true },
    });

    if (!payment) {
      // Every captured JSMF payment has its provider payment id recorded at
      // settlement, so an unknown one is a Payment Page / payment link refund
      // on the same account — nothing here to revoke. See process().
      activity(this.logger, 'webhook.foreign_refund_ignored', {
        eventId: event.eventId,
        providerPaymentId: event.providerPaymentId,
        providerRefundId: event.providerRefundId,
      }, 'warn');
      return;
    }

    // Non-null only on the pass that actually revokes access, so a redelivered
    // event or a partial return produces no second — or contradictory — email.
    const refundedInFull = await this.prisma.$transaction(async (tx) => {
      // `provider_refund_id` is UNIQUE, so this is what makes a redelivered
      // event — or the webhook for a refund `refund()` already recorded — a
      // no-op rather than a second revocation.
      const already = await tx.refund.findUnique({
        where: { providerRefundId: event.providerRefundId },
        select: { id: true },
      });

      if (already) return null;

      await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId: payment.orderId,
          providerRefundId: event.providerRefundId,
          // The refund's own amount, never the payment's — see
          // `refundAmountMinor` on the port for why those differ here.
          amountMinor: event.refundAmountMinor ?? payment.amountMinor,
          status: RefundStatus.PROCESSED,
          reason: 'Refunded in the Razorpay dashboard',
          // No `initiatedById`: nobody signed in here did this, and naming an
          // admin who did not would make the audit trail wrong rather than full.
          rawResponse: event.payload as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });

      // Everything returned so far, including refunds `refund()` recorded, so a
      // purchase refunded in two parts still ends with access removed.
      const returned = await tx.refund.aggregate({
        where: { paymentId: payment.id, status: RefundStatus.PROCESSED },
        _sum: { amountMinor: true },
      });

      if ((returned._sum.amountMinor ?? 0n) < payment.amountMinor) {
        this.logger.log(
          `Partial refund recorded on order ${payment.orderId}; access left in place`,
        );
        return null;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.REFUNDED, cancelledAt: new Date() },
      });

      await this.entitlements.revokeForOrder(
        payment.orderId,
        'Refunded in the Razorpay dashboard',
        tx,
      );

      // The whole captured amount, not this event's slice: a purchase returned
      // in two parts is confirmed once, for what the buyer actually gets back.
      return returned._sum.amountMinor ?? payment.amountMinor;
    });

    this.logger.log(`Applied provider-initiated refund ${event.providerRefundId}`);

    if (refundedInFull !== null) {
      await this.sendRefundNotice(payment.orderId, refundedInFull, event.providerRefundId);
    }
  }

  private async markFailed(event: PaymentWebhookEvent): Promise<void> {
    if (!event.providerOrderId) return;

    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: event.providerOrderId },
    });

    if (!payment || payment.status === PaymentStatus.CAPTURED || payment.status === PaymentStatus.REFUNDED) {
      return;
    }

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

      // Recorded, not final. Razorpay lets the buyer retry inside the same
      // checkout window — same Razorpay order — so a failed card is often
      // followed seconds later by a captured UPI payment. `settle` moves a
      // FAILED order to PAID when that capture arrives, and reconciliation
      // still checks FAILED orders for exactly that reason. Conditional so a
      // failure event delivered *after* the capture cannot undo it.
      await tx.order.updateMany({
        where: { id: payment.orderId, status: { in: [OrderStatus.CREATED, OrderStatus.AWAITING_PAYMENT] } },
        data: { status: OrderStatus.FAILED },
      });
    });

    activity(this.logger, 'payment.failed', {
      orderId: payment.orderId,
      providerOrderId: event.providerOrderId,
      providerPaymentId: event.providerPaymentId,
      errorCode: event.errorCode,
      errorDescription: event.errorDescription,
    }, 'warn');
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

    await this.sendRefundNotice(order.id, providerRefund.amountMinor, providerRefund.providerRefundId);

    return { orderId: order.id, status: OrderStatus.REFUNDED };
  }

  /**
   * Tells the buyer their money is on its way back. Best-effort, for the same
   * reason the purchase receipt is: the refund has already been made with the
   * provider and the entitlement already revoked by the time this runs, so a
   * bounced notification must not turn a completed refund into an error — and
   * on the webhook path, must not leave Razorpay retrying an event that has
   * fully applied.
   *
   * Email only. There is no approved WhatsApp template for a refund, and unlike
   * the receipt there is no second channel worth falling back to: a buyer with
   * no address on the order is someone support is already in a conversation
   * with, since that is the only way the refund got requested.
   */
  private async sendRefundNotice(
    orderId: string,
    refundedAmountMinor: bigint,
    refundId: string,
  ): Promise<void> {
    // A free order returns no money, so there is nothing to confirm.
    if (refundedAmountMinor <= 0n) return;

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          orderNumber: true,
          currency: true,
          customerEmail: true,
          user: { select: { name: true } },
          items: { select: { productTitleSnapshot: true } },
        },
      });

      if (!order?.customerEmail) {
        this.logger.log(
          `Refund on order ${order?.orderNumber ?? orderId} not emailed: no address on the order.`,
        );
        return;
      }

      const rendered = refundConfirmation({
        buyerName: firstName(order.user.name),
        items: order.items.map((item) => ({ title: item.productTitleSnapshot })),
        refundedFormatted: formatMoney(refundedAmountMinor, order.currency),
        orderNumber: order.orderNumber,
        refundId,
      });

      const outcome = await this.mail.sendBestEffort({
        to: { email: order.customerEmail, name: order.user.name },
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        tag: 'refund-confirmation',
      });

      if (!outcome.delivered) {
        this.logger.warn(
          `Refund notice for order ${order.orderNumber} was not delivered: ${outcome.reason}. ` +
            `The refund itself is complete.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not send the refund notice for order ${orderId}: ${(error as Error).message}. ` +
          `The refund itself is complete.`,
      );
    }
  }
}
