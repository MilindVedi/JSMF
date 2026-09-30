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

  register(listener: OrderPaidListener): void {
    this.listeners.push(listener);
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
}
