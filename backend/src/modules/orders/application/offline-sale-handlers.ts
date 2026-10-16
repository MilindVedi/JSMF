import { Injectable } from '@nestjs/common';
import type { Prisma, ProductType } from '@prisma/client';

/** What a handler gets to finish one offline sale, inside its transaction. */
export interface OfflineSaleContext {
  productId: string;
  userId: string;
  orderId: string;
  paidAt: Date;
  /** E.164 digits, or null. */
  whatsappNumber: string | null;
  /** The handler's own answers, as `validateDetails` returned them. */
  details: Record<string, unknown>;
}

/**
 * What one kind of product needs, beyond an order and an entitlement, when an
 * admin records a sale made outside checkout.
 *
 * A product type can be sold offline only once a handler for it is registered
 * — a one-to-one call, for instance, also needs a time slot, and must not be
 * half-recorded by a generic path that does not know that. The owning module
 * registers its handler on startup, as it does for OrderEvents: the orders
 * module never imports it, so supporting the next product type never means
 * editing this one.
 */
export interface OfflineSaleHandler {
  readonly productType: ProductType;

  /**
   * Checks the type's own answers on one row (a session's exam and stage).
   * Returns the cleaned answers, or messages saying what is wrong.
   */
  validateDetails(details: Record<string, unknown>): { details: Record<string, unknown>; errors: string[] };

  /** Whether the products included with this one are granted at payment, as checkout would. */
  grantsIncludedItemsNow(productId: string, tx: Prisma.TransactionClient): Promise<boolean>;

  /** Writes the type's own rows (a session registration), in the sale's transaction. */
  apply(context: OfflineSaleContext, tx: Prisma.TransactionClient): Promise<void>;

  /** Things worth knowing before recording `count` more sales (seats over capacity, an email due soon). */
  warnings?(productId: string, count: number): Promise<string[]>;

  /** The type's answers per buyer, for the admin's list (e.g. { "Exam": "NEET-PG" }). */
  describe?(productId: string, userIds: string[]): Promise<Map<string, Record<string, string>>>;
}

@Injectable()
export class OfflineSaleHandlers {
  private readonly handlers = new Map<ProductType, OfflineSaleHandler>();

  register(handler: OfflineSaleHandler): void {
    if (this.handlers.has(handler.productType)) {
      throw new Error(`An offline-sale handler for ${handler.productType} is already registered`);
    }
    this.handlers.set(handler.productType, handler);
  }

  for(type: ProductType): OfflineSaleHandler | undefined {
    return this.handlers.get(type);
  }
}
