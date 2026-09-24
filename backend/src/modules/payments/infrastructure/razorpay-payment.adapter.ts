import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PaymentProvider as PaymentProviderName } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../../../config/config.module';
import {
  CheckoutSignatureRequest,
  CreateOrderRequest,
  NormalizedPaymentEvent,
  PaymentProvider,
  ProviderOrder,
  ProviderOrderDetails,
  ProviderPayment,
  ProviderRefund,
  RefundRequest,
  WebhookVerification,
} from '../domain/payment-provider.port';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

/** Razorpay event name → what this platform does about it. */
const EVENT_MAP: Record<string, NormalizedPaymentEvent> = {
  'payment.authorized': 'PAYMENT_AUTHORIZED',
  'payment.captured': 'PAYMENT_CAPTURED',
  'payment.failed': 'PAYMENT_FAILED',
  'refund.processed': 'REFUND_PROCESSED',
};

const STATUS_MAP: Record<string, ProviderPayment['status']> = {
  created: 'CREATED',
  authorized: 'AUTHORIZED',
  captured: 'CAPTURED',
  refunded: 'REFUNDED',
  failed: 'FAILED',
};

interface RazorpayEntity {
  id?: string;
  order_id?: string;
  payment_id?: string;
  amount?: number;
  currency?: string;
  method?: string;
  status?: string;
  receipt?: string;
  notes?: Record<string, string>;
  error_code?: string | null;
  error_description?: string | null;
}

/**
 * Razorpay over its REST API directly.
 *
 * No SDK: the surface actually used is three endpoints plus an HMAC, the
 * security-critical half is `crypto.createHmac` either way, and a dependency
 * that wraps `fetch` is a dependency whose release cadence becomes ours. The
 * request shapes below are pinned by Razorpay's documented API, not by a
 * package version.
 */
@Injectable()
export class RazorpayPaymentAdapter extends PaymentProvider {
  readonly name = PaymentProviderName.RAZORPAY;

  private readonly logger = new Logger(RazorpayPaymentAdapter.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  async createOrder(request: CreateOrderRequest): Promise<ProviderOrder> {
    const body = await this.call<RazorpayEntity>('POST', '/orders', {
      amount: this.toPaiseNumber(request.amountMinor),
      currency: request.currency,
      // Our order number, so a Razorpay dashboard row can be traced back to a
      // JSMF order without a database lookup.
      receipt: request.orderNumber,
      notes: { ...request.notes, jsmf_order_id: request.orderId, email: request.customerEmail },
    });

    if (!body.id) {
      throw new ServiceUnavailableException('Razorpay did not return an order id');
    }

    return {
      provider: this.name,
      providerOrderId: body.id,
      amountMinor: BigInt(body.amount ?? 0),
      currency: body.currency ?? request.currency,
      checkoutKeyId: this.config.get('RAZORPAY_KEY_ID') ?? '',
    };
  }

  verifyCheckoutSignature(request: CheckoutSignatureRequest): boolean {
    // Razorpay's documented construction: order id and payment id joined by a
    // pipe, keyed with the API secret.
    const expected = createHmac('sha256', this.config.get('RAZORPAY_KEY_SECRET') ?? '')
      .update(`${request.providerOrderId}|${request.providerPaymentId}`)
      .digest('hex');

    return timingSafeCompare(expected, request.signature);
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookVerification {
    const signature = headers['x-razorpay-signature'];
    if (!signature) {
      return { signatureValid: false, reason: 'Missing x-razorpay-signature header' };
    }

    const expected = createHmac('sha256', this.config.get('RAZORPAY_WEBHOOK_SECRET') ?? '')
      .update(rawBody)
      .digest('hex');

    if (!timingSafeCompare(expected, signature)) {
      return { signatureValid: false, reason: 'Webhook signature mismatch' };
    }

    let payload: { event?: string; payload?: Record<string, { entity?: RazorpayEntity }> };
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as typeof payload;
    } catch {
      return { signatureValid: false, reason: 'Webhook body is not valid JSON' };
    }

    const eventType = payload.event ?? 'unknown';
    const payment = payload.payload?.payment?.entity;
    const refund = payload.payload?.refund?.entity;

    // Razorpay's own event id. Using anything generated here would defeat the
    // UNIQUE constraint that makes redelivery harmless.
    const eventId = headers['x-razorpay-event-id'];
    if (!eventId) {
      return { signatureValid: false, reason: 'Missing x-razorpay-event-id header' };
    }

    return {
      signatureValid: true,
      event: {
        eventId,
        eventType,
        normalizedType: EVENT_MAP[eventType] ?? 'IGNORED',
        providerOrderId: payment?.order_id,
        providerPaymentId: payment?.id ?? refund?.payment_id,
        providerRefundId: refund?.id,
        amountMinor:
          payment?.amount !== undefined
            ? BigInt(payment.amount)
            : refund?.amount !== undefined
              ? BigInt(refund.amount)
              : undefined,
        currency: payment?.currency ?? refund?.currency,
        method: payment?.method,
        errorCode: payment?.error_code ?? undefined,
        errorDescription: payment?.error_description ?? undefined,
        payload,
      },
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const body = await this.call<RazorpayEntity>(
      'GET',
      `/payments/${encodeURIComponent(providerPaymentId)}`,
    );

    return {
      providerPaymentId: body.id ?? providerPaymentId,
      providerOrderId: body.order_id,
      status: STATUS_MAP[body.status ?? ''] ?? 'CREATED',
      amountMinor: BigInt(body.amount ?? 0),
      currency: body.currency ?? 'INR',
      method: body.method,
      raw: body,
    };
  }

  async fetchOrder(providerOrderId: string): Promise<ProviderOrderDetails> {
    const body = await this.call<RazorpayEntity>(
      'GET',
      `/orders/${encodeURIComponent(providerOrderId)}`,
    );

    return {
      providerOrderId: body.id ?? providerOrderId,
      receipt: body.receipt,
      notes: body.notes ?? {},
      amountMinor: BigInt(body.amount ?? 0),
      currency: body.currency ?? 'INR',
    };
  }

  async fetchPaymentsForOrder(providerOrderId: string): Promise<ProviderPayment[]> {
    const body = await this.call<{ items?: RazorpayEntity[] }>(
      'GET',
      `/orders/${encodeURIComponent(providerOrderId)}/payments`,
    );

    return (body.items ?? []).map((item) => ({
      providerPaymentId: item.id ?? '',
      providerOrderId: item.order_id,
      status: STATUS_MAP[item.status ?? ''] ?? 'CREATED',
      amountMinor: BigInt(item.amount ?? 0),
      currency: item.currency ?? 'INR',
      method: item.method,
      raw: item,
    }));
  }

  async refund(request: RefundRequest): Promise<ProviderRefund> {
    const body = await this.call<RazorpayEntity>(
      'POST',
      `/payments/${encodeURIComponent(request.providerPaymentId)}/refund`,
      {
        amount: this.toPaiseNumber(request.amountMinor),
        notes: request.reason ? { reason: request.reason } : undefined,
      },
    );

    return {
      providerRefundId: body.id ?? '',
      amountMinor: BigInt(body.amount ?? 0),
      status: body.status === 'processed' ? 'PROCESSED' : body.status === 'failed' ? 'FAILED' : 'PENDING',
      raw: body,
    };
  }

  // --- transport ----------------------------------------------------------

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const credentials = Buffer.from(
      `${this.config.get('RAZORPAY_KEY_ID')}:${this.config.get('RAZORPAY_KEY_SECRET')}`,
    ).toString('base64');

    let response: Response;
    try {
      response = await fetch(`${RAZORPAY_API}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${credentials}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (cause) {
      // A network failure must not surface as a 500 that looks like our bug.
      throw new ServiceUnavailableException(
        `Could not reach Razorpay: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    const text = await response.text();

    if (!response.ok) {
      // The body may contain the customer's details; log the status and
      // Razorpay's error code, not the whole payload.
      this.logger.error(`Razorpay ${method} ${path} → ${response.status}`);
      throw new ServiceUnavailableException(
        `Razorpay rejected ${method} ${path} with status ${response.status}`,
      );
    }

    return JSON.parse(text) as T;
  }

  /**
   * Razorpay takes the amount as a JSON number of paise. Our money is BigInt
   * precisely so it never passes through a float — this is the one boundary
   * where it must, so the conversion is checked rather than assumed.
   */
  private toPaiseNumber(amountMinor: bigint): number {
    if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Amount ${amountMinor} exceeds what can be sent safely as a JSON number`);
    }
    return Number(amountMinor);
  }
}

/** Constant-time comparison that tolerates length mismatch without throwing. */
export function timingSafeCompare(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
