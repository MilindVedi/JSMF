import { Injectable, Logger } from '@nestjs/common';
import type { ProductType } from '@prisma/client';

export interface OrderPaidEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  customerEmail: string | null;
  customerName: string;
  items: Array<{ productId: string; productType: ProductType; title: string }>;
  totalAmountMinor: bigint;
  currency: string;
  paymentId: string;
}

/**
 * Something outside the orders module that cares an order was paid.
 *
 * Returns whether it took charge of the buyer's confirmation. A live session
 * does — its email carries the date and joining link, which a generic "your
 * files are in your library" receipt cannot — and the generic receipt is then
 * skipped so the buyer gets one email, not two.
 */
export interface OrderPaidListener {
  onOrderPaid(event: OrderPaidEvent): Promise<{ confirmationHandled: boolean }>;
}

/** An order whose whole payment has been returned. */
export interface OrderRefundedEvent {
  orderId: string;
  reason: string;
}

/**
 * Something outside the orders module that holds state tied to a paid order —
 * a booked one-to-one call holding a time slot — and must let go of it when the
 * order is refunded. Entitlements are revoked by settlement itself; this is for
 * everything that is not an entitlement.
 */
export interface OrderRefundedListener {
  onOrderRefunded(event: OrderRefundedEvent): Promise<void>;
}

/**
 * How other modules react to payments without the payment code knowing they
 * exist.
 *
 * The orders module announces "this order is paid", after the commit; a
 * listener (the live-sessions module today) registers itself on startup. The
 * dependency points one way — sessions depend on orders, never the reverse —
 * so adding the next kind of product never means editing settlement.
 *
 * Listener failures are logged and swallowed. By the time this runs the money
 * is taken and access is granted; a listener that throws must not turn a
 * completed purchase into an error, the same rule receipts already follow.
 */
@Injectable()
export class OrderEvents {
  private readonly logger = new Logger(OrderEvents.name);
  private readonly listeners: OrderPaidListener[] = [];
  private readonly refundListeners: OrderRefundedListener[] = [];

  register(listener: OrderPaidListener): void {
    this.listeners.push(listener);
  }

  registerRefundListener(listener: OrderRefundedListener): void {
    this.refundListeners.push(listener);
  }

  async paid(event: OrderPaidEvent): Promise<{ confirmationHandled: boolean }> {
    let confirmationHandled = false;

    for (const listener of this.listeners) {
      try {
        const result = await listener.onOrderPaid(event);
        confirmationHandled ||= result.confirmationHandled;
      } catch (cause) {
        this.logger.error(
          `Order-paid listener failed for ${event.orderNumber}: ` +
            `${cause instanceof Error ? cause.message : String(cause)} — the purchase itself is complete`,
        );
      }
    }

    return { confirmationHandled };
  }

  /**
   * Announced after the refund has committed, for a full refund only — a
   * partial one leaves the purchase in place. Same rule as `paid`: the money
   * has already gone back, so a listener that throws is logged, never turned
   * into an error for the admin or a failed webhook for Razorpay to retry.
   */
  async refunded(event: OrderRefundedEvent): Promise<void> {
    for (const listener of this.refundListeners) {
      try {
        await listener.onOrderRefunded(event);
      } catch (cause) {
        this.logger.error(
          `Order-refunded listener failed for order ${event.orderId}: ` +
            `${cause instanceof Error ? cause.message : String(cause)} — the refund itself is complete`,
        );
      }
    }
  }
}
