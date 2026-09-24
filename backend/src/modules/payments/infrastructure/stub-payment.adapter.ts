import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider as PaymentProviderName } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
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
import { timingSafeCompare } from './razorpay-payment.adapter';

interface StubPaymentRecord {
  providerPaymentId: string;
  providerOrderId: string;
  status: ProviderPayment['status'];
  amountMinor: bigint;
  currency: string;
  method: string;
}

/** What a simulated webhook delivery looks like to the HTTP endpoint. */
export interface SimulatedWebhookDelivery {
  rawBody: Buffer;
  headers: Record<string, string>;
}

/**
 * Simulated payments for development.
 *
 * It deliberately mirrors Razorpay's *mechanics*, not merely its outcomes: the
 * same `orderId|paymentId` HMAC for the checkout callback, the same
 * HMAC-over-raw-body for webhooks, the same header names, the same event
 * vocabulary. Signature verification can therefore fail here for the same
 * reasons it would fail in production.
 *
 * A stub that simply returned `true` would let the entire checkout flow be
 * built against an interface whose hard parts had never once run — and the
 * first time they ran would be against real money.
 *
 * Env validation refuses to boot production with this driver selected.
 */
@Injectable()
export class StubPaymentAdapter extends PaymentProvider {
  readonly name = PaymentProviderName.STUB;

  private readonly logger = new Logger(StubPaymentAdapter.name);
  /** In-memory only: restarting the API clears simulated payment history. */
  private readonly payments = new Map<string, StubPaymentRecord>();
  private readonly orders = new Map<
    string,
    { amountMinor: bigint; currency: string; receipt: string; notes: Record<string, string> }
  >();

  constructor(private readonly config: AppConfig) {
    super();
  }

  createOrder(request: CreateOrderRequest): Promise<ProviderOrder> {
    const providerOrderId = `order_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    this.orders.set(providerOrderId, {
      amountMinor: request.amountMinor,
      currency: request.currency,
      receipt: request.orderNumber,
      // Mirrors what the Razorpay adapter attaches, so the recovery path that
      // reads `jsmf_order_id` back off the provider is exercised here too.
      notes: { ...request.notes, jsmf_order_id: request.orderId, email: request.customerEmail },
    });

    this.logger.debug(`simulated order ${providerOrderId} for ${request.orderNumber}`);

    return Promise.resolve({
      provider: this.name,
      providerOrderId,
      amountMinor: request.amountMinor,
      currency: request.currency,
      checkoutKeyId: 'stub_key_id',
    });
  }

  verifyCheckoutSignature(request: CheckoutSignatureRequest): boolean {
    return timingSafeCompare(
      this.signCheckout(request.providerOrderId, request.providerPaymentId),
      request.signature,
    );
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookVerification {
    const signature = headers['x-razorpay-signature'] ?? headers['x-jsmf-stub-signature'];
    if (!signature) {
      return { signatureValid: false, reason: 'Missing stub webhook signature header' };
    }

    if (!timingSafeCompare(this.signBody(rawBody), signature)) {
      return { signatureValid: false, reason: 'Webhook signature mismatch' };
    }

    let payload: {
      event?: string;
      event_id?: string;
      payload?: { payment?: { entity?: Record<string, unknown> } };
    };
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as typeof payload;
    } catch {
      return { signatureValid: false, reason: 'Webhook body is not valid JSON' };
    }

    const entity = payload.payload?.payment?.entity ?? {};
    const eventId = payload.event_id ?? headers['x-razorpay-event-id'];
    if (!eventId) {
      return { signatureValid: false, reason: 'Missing event id' };
    }

    const eventType = payload.event ?? 'payment.captured';
    const normalized: Record<string, NormalizedPaymentEvent> = {
      'payment.authorized': 'PAYMENT_AUTHORIZED',
      'payment.captured': 'PAYMENT_CAPTURED',
      'payment.failed': 'PAYMENT_FAILED',
      'refund.processed': 'REFUND_PROCESSED',
    };

    return {
      signatureValid: true,
      event: {
        eventId,
        eventType,
        normalizedType: normalized[eventType] ?? 'IGNORED',
        providerOrderId: entity.order_id as string | undefined,
        providerPaymentId: entity.id as string | undefined,
        amountMinor: entity.amount !== undefined ? BigInt(entity.amount as number) : undefined,
        currency: entity.currency as string | undefined,
        method: entity.method as string | undefined,
        payload,
      },
    };
  }

  fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const record = this.payments.get(providerPaymentId);

    if (!record) {
      return Promise.reject(new Error(`Unknown simulated payment ${providerPaymentId}`));
    }

    return Promise.resolve({ ...record, raw: record });
  }

  fetchOrder(providerOrderId: string): Promise<ProviderOrderDetails> {
    const order = this.orders.get(providerOrderId);

    if (!order) {
      return Promise.reject(new Error(`Unknown simulated order ${providerOrderId}`));
    }

    return Promise.resolve({
      providerOrderId,
      receipt: order.receipt,
      notes: order.notes,
      amountMinor: order.amountMinor,
      currency: order.currency,
    });
  }

  fetchPaymentsForOrder(providerOrderId: string): Promise<ProviderPayment[]> {
    const matches = [...this.payments.values()]
      .filter((record) => record.providerOrderId === providerOrderId)
      .map((record) => ({ ...record, raw: record }));

    return Promise.resolve(matches);
  }

  refund(request: RefundRequest): Promise<ProviderRefund> {
    const record = this.payments.get(request.providerPaymentId);
    if (record) record.status = 'REFUNDED';

    return Promise.resolve({
      providerRefundId: `rfnd_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      amountMinor: request.amountMinor,
      status: 'PROCESSED',
      raw: { simulated: true, reason: request.reason },
    });
  }

  // --- simulation controls (development only) -----------------------------

  /**
   * Produces exactly what the webhook endpoint would receive from a real
   * provider — correctly signed raw bytes plus headers — so the webhook path is
   * driven through its real verification, idempotency and entitlement-granting
   * logic rather than being bypassed by a test-only shortcut.
   */
  simulateWebhook(params: {
    providerOrderId: string;
    amountMinor: bigint;
    currency?: string;
    eventType?: 'payment.captured' | 'payment.authorized' | 'payment.failed';
    /** Reusing an event id is how redelivery (and the UNIQUE guard) gets tested. */
    eventId?: string;
    providerPaymentId?: string;
  }): SimulatedWebhookDelivery {
    const providerPaymentId =
      params.providerPaymentId ?? `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const eventType = params.eventType ?? 'payment.captured';
    const currency = params.currency ?? 'INR';

    this.payments.set(providerPaymentId, {
      providerPaymentId,
      providerOrderId: params.providerOrderId,
      status: eventType === 'payment.failed' ? 'FAILED' : 'CAPTURED',
      amountMinor: params.amountMinor,
      currency,
      method: 'upi',
    });

    const body = {
      event: eventType,
      event_id: params.eventId ?? `evt_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: params.providerOrderId,
            amount: Number(params.amountMinor),
            currency,
            method: 'upi',
            status: eventType === 'payment.failed' ? 'failed' : 'captured',
          },
        },
      },
    };

    const rawBody = Buffer.from(JSON.stringify(body), 'utf8');

    return {
      rawBody,
      headers: {
        'x-razorpay-signature': this.signBody(rawBody),
        'x-razorpay-event-id': body.event_id,
      },
    };
  }

  /** The signature a simulated checkout widget would hand the browser. */
  signCheckout(providerOrderId: string, providerPaymentId: string): string {
    return createHmac('sha256', this.config.get('STUB_PAYMENT_SECRET'))
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex');
  }

  private signBody(rawBody: Buffer): string {
    return createHmac('sha256', this.config.get('STUB_PAYMENT_SECRET'))
      .update(rawBody)
      .digest('hex');
  }
}
