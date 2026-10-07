import { PaymentProvider as PaymentProviderName } from '@prisma/client';

export interface CreateOrderRequest {
  /** Our own order id and human-readable number, echoed back by the provider. */
  orderId: string;
  orderNumber: string;
  amountMinor: bigint;
  /** ISO-4217, e.g. `INR`. */
  currency: string;
  customerEmail: string | null;
  notes?: Record<string, string>;
}

export interface ProviderOrder {
  provider: PaymentProviderName;
  providerOrderId: string;
  amountMinor: bigint;
  currency: string;
  /**
   * The *publishable* key the browser checkout widget needs. Named explicitly
   * so that nobody ever reaches for the secret when wiring up the frontend —
   * the port gives no access to the secret at all.
   */
  checkoutKeyId: string;
}

/** The browser's post-payment callback, which must be verified server-side. */
export interface CheckoutSignatureRequest {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export type NormalizedPaymentEvent =
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'REFUND_PROCESSED'
  /** Delivered and authentic, but not an event this platform acts on. */
  | 'IGNORED';

export interface PaymentWebhookEvent {
  /**
   * The provider's own event id. Stored in `payment_webhook_events`, where it
   * carries a UNIQUE constraint — that column is the entire idempotency
   * mechanism, so an adapter must return the provider's id and never a freshly
   * generated one, or a redelivered webhook would be processed twice.
   */
  eventId: string;
  /** The provider's raw event name, kept verbatim for the audit row. */
  eventType: string;
  normalizedType: NormalizedPaymentEvent;
  providerOrderId?: string;
  providerPaymentId?: string;
  providerRefundId?: string;
  amountMinor?: bigint;
  /**
   * The amount of *this refund*, which is not `amountMinor`.
   *
   * A refund event carries both the refund and the payment it came from, and
   * `amountMinor` reports the payment — the full sum originally captured. A
   * partial refund is the case that makes the difference load-bearing: reading
   * the payment's amount there would look like the whole purchase had been
   * returned and would revoke access the buyer has still paid for.
   */
  refundAmountMinor?: bigint;
  /** The rail the provider actually returned the money over, when it says. */
  refundSpeedProcessed?: RefundSpeed;
  currency?: string;
  method?: string;
  errorCode?: string;
  errorDescription?: string;
  /** The provider's payload verbatim — the evidence in a dispute. */
  payload: unknown;
}

/**
 * A discriminated union, deliberately: the event is unreachable on the invalid
 * branch, so no caller can read a webhook's contents without having proved it
 * authentic. The alternative shape — `{ valid: boolean, event }` — compiles
 * just as well when the check is forgotten.
 */
export type WebhookVerification =
  | { signatureValid: true; event: PaymentWebhookEvent }
  | { signatureValid: false; reason: string };

/**
 * A provider order as the provider itself holds it.
 *
 * `notes` matters more than it looks: `createOrder` writes our own order id
 * there, so this is what lets a provider order be traced back to a JSMF order
 * using nothing but the provider's copy — the recovery path when our own link
 * between the two was never written.
 */
export interface ProviderOrderDetails {
  providerOrderId: string;
  /** Whatever `createOrder` sent as the receipt — our order number. */
  receipt?: string;
  notes: Record<string, string>;
  amountMinor: bigint;
  currency: string;
}

export interface ProviderPayment {
  providerPaymentId: string;
  providerOrderId?: string;
  status: 'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
  amountMinor: bigint;
  currency: string;
  method?: string;
  raw: unknown;
}

/**
 * How quickly the money is returned.
 *
 * `NORMAL` goes back through the card/bank rails the payment came in on and
 * takes days. `INSTANT` asks the provider to push it over a real-time rail
 * instead, which lands in minutes — but costs a per-refund fee and only works
 * where the underlying method supports it. Providers fall back to normal on
 * their own when it does not, so asking for instant is a preference rather
 * than a promise, and nothing downstream may assume it was honoured.
 */
export type RefundSpeed = 'NORMAL' | 'INSTANT';

export interface RefundRequest {
  providerPaymentId: string;
  amountMinor: bigint;
  reason?: string;
  /** Defaults to `NORMAL`: the cheap rail, and the one that always works. */
  speed?: RefundSpeed;
}

export interface ProviderRefund {
  providerRefundId: string;
  amountMinor: bigint;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  /**
   * What the provider actually used, which is not always what was asked for.
   * Undefined when the provider does not report it.
   */
  speedProcessed?: RefundSpeed;
  raw: unknown;
}

/**
 * The payments port.
 *
 * Application code depends on this and never on Razorpay's API shape, so a
 * second provider (Stripe, PayU, Cashfree) becomes one new adapter plus a value
 * in the `PaymentProvider` enum — which is why that enum exists as a column on
 * `payments` rather than being assumed globally.
 *
 * Every method that verifies something does so server-side. Nothing in this
 * interface accepts a client's claim about whether a payment succeeded.
 */
export abstract class PaymentProvider {
  abstract readonly name: PaymentProviderName;

  abstract createOrder(request: CreateOrderRequest): Promise<ProviderOrder>;

  /**
   * Verifies the signature the checkout widget hands back to the browser.
   *
   * This is a convenience for updating the UI promptly; it is explicitly *not*
   * the authority for granting access. The webhook is, because a user closing
   * the tab after paying must still receive what they bought.
   */
  abstract verifyCheckoutSignature(request: CheckoutSignatureRequest): boolean;

  /**
   * @param rawBody the exact bytes received — the HMAC is computed over them,
   * so a re-serialised parsed object would not match.
   */
  abstract verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookVerification;

  /** Authoritative server-side state, for reconciliation and support queries. */
  abstract fetchPayment(providerPaymentId: string): Promise<ProviderPayment>;

  /**
   * The provider's own record of an order, including the notes we attached to
   * it. Used to repair a provider order whose local `payments` row was never
   * written — the notes carry our order id, so the link is recoverable.
   */
  abstract fetchOrder(providerOrderId: string): Promise<ProviderOrderDetails>;

  /**
   * Every payment attempt made against a provider order.
   *
   * Reconciliation needs this rather than `fetchPayment`: when a webhook never
   * arrived and the buyer closed the tab, the provider payment id is precisely
   * the thing we do not have. The provider order id is, because we created it.
   */
  abstract fetchPaymentsForOrder(providerOrderId: string): Promise<ProviderPayment[]>;

  abstract refund(request: RefundRequest): Promise<ProviderRefund>;
}
