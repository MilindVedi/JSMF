import { Injectable, Logger } from '@nestjs/common';
import {
  Entitlement,
  EntitlementSource,
  EntitlementStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface GrantInput {
  userId: string;
  productId: string;
  source: EntitlementSource;
  sourceOrderId?: string | null;
  sourceProductId?: string | null;
  expiresAt?: Date | null;
}

/**
 * Access control, and the only table that answers "may this person have this
 * file".
 *
 * Everything that can confer access — a paid order, a free claim, an admin
 * gift, a bundle, a future subscription — writes here, so the download path has
 * exactly one question to ask rather than a growing chain of special cases.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grants access, idempotently.
   *
   * Idempotency is enforced by the database, not by checking first: the partial
   * unique index `entitlements_user_product_active_unique` (on user_id,
   * product_id WHERE status = 'ACTIVE') rejects a second concurrent grant. A
   * read-then-write check would have a window between the two where a duplicate
   * webhook and the browser's verify call could both pass.
   *
   * The conflict is absorbed by `ON CONFLICT DO NOTHING` (`skipDuplicates`)
   * rather than by catching the unique violation, because this usually runs
   * inside the caller's transaction — `settle` grants one entitlement per order
   * item — and in Postgres a raised constraint error **aborts that whole
   * transaction**. The recovery query would then fail too, rolling back a
   * settlement that had in fact succeeded moments earlier on the other path.
   * That turned the very race this method exists to tolerate into an error for
   * whichever caller arrived second. Not raising it in the first place keeps
   * the transaction alive, at the cost of one extra SELECT per grant.
   */
  async grant(input: GrantInput, tx?: Prisma.TransactionClient): Promise<Entitlement> {
    const db = tx ?? this.prisma;

    const inserted = await db.entitlement.createMany({
      data: [
        {
          userId: input.userId,
          productId: input.productId,
          source: input.source,
          sourceOrderId: input.sourceOrderId ?? null,
          sourceProductId: input.sourceProductId ?? null,
          status: EntitlementStatus.ACTIVE,
          expiresAt: input.expiresAt ?? null,
        },
      ],
      skipDuplicates: true,
    });

    const entitlement = await db.entitlement.findFirst({
      where: {
        userId: input.userId,
        productId: input.productId,
        status: EntitlementStatus.ACTIVE,
      },
    });

    if (!entitlement) {
      // Nothing was inserted and nothing is active: the insert conflicted with
      // something other than the active-grant index, which is not a race this
      // method may quietly swallow.
      throw new Error(
        `Entitlement for user ${input.userId} / product ${input.productId} was neither created nor found`,
      );
    }

    if (inserted.count === 0) {
      // Already entitled. The expected outcome of a redelivered webhook or a
      // verify call racing one, not an error.
      this.logger.debug(
        `Entitlement already active for user ${input.userId} / product ${input.productId}`,
      );
    }

    return entitlement;
  }

  /** The single access check. Null means no live entitlement. */
  async findActive(userId: string, productId: string): Promise<Entitlement | null> {
    const entitlement = await this.prisma.entitlement.findFirst({
      where: { userId, productId, status: EntitlementStatus.ACTIVE },
    });

    // An expiry in the past is not access, even though the row still says
    // ACTIVE — nothing sweeps expired rows synchronously, so the check has to
    // happen at read time. V1 grants are perpetual (expiresAt null), but
    // subscriptions will not be.
    if (entitlement?.expiresAt && entitlement.expiresAt <= new Date()) return null;

    return entitlement;
  }

  /** Used when a payment is refunded or an admin withdraws access. */
  async revoke(
    entitlementId: string,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    // status and revoked_at must move together — entitlements_revocation_is_coherent
    // rejects a REVOKED row with no timestamp, and vice versa.
    await db.entitlement.update({
      where: { id: entitlementId },
      data: {
        status: EntitlementStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  async revokeForOrder(
    orderId: string,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;

    const affected = await db.entitlement.updateMany({
      where: { sourceOrderId: orderId, status: EntitlementStatus.ACTIVE },
      data: {
        status: EntitlementStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    return affected.count;
  }

  /** The buyer's library. */
  async listForUser(userId: string) {
    return this.prisma.entitlement.findMany({
      where: { userId, status: EntitlementStatus.ACTIVE },
      orderBy: { grantedAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            title: true,
            subtitle: true,
            type: true,
            accessType: true,
            status: true,
          },
        },
      },
    });
  }
}
