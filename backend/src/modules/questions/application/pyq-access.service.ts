import { ForbiddenException, Injectable } from '@nestjs/common';
import { EntitlementStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { startOfIndiaDay } from '../domain/question-view';

/**
 * The marker that makes a product a PYQ plan: `products.metadata` containing
 * `{"pyqSubscription": true}`. A metadata flag rather than a new ProductType
 * so plans need no schema change to products, and any product type (a COURSE
 * today, a subscription later) can carry it.
 */
export const PYQ_SUBSCRIPTION_METADATA_KEY = 'pyqSubscription';

export interface PyqAccess {
  subscribed: boolean;
  /** Null when subscribed (no limit). */
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
  /** The plan behind `subscribed`; null for free users. expiresAt null = no end. */
  plan: { productId: string; title: string; expiresAt: string | null } | null;
}

/**
 * The single answer to "may this student practise right now". Everything
 * about plans — what counts as a subscription, how big the free allowance is,
 * what a day is — is decided here and nowhere else, so pricing can change
 * without touching the practice flow.
 */
@Injectable()
export class PyqAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly config: AppConfig,
  ) {}

  isSubscribed(userId: string): Promise<boolean> {
    return this.entitlements.hasActiveMatching(userId, {
      deletedAt: null,
      metadata: { path: [PYQ_SUBSCRIPTION_METADATA_KEY], equals: true },
    });
  }

  async describe(userId: string): Promise<PyqAccess> {
    const [current, usedToday] = await Promise.all([
      this.currentPlan(userId),
      this.answeredToday(userId),
    ]);
    const subscribed = current !== null;
    if (subscribed) {
      return { subscribed, dailyLimit: null, usedToday, remainingToday: null, plan: current };
    }
    const dailyLimit = this.config.get('PYQ_FREE_DAILY_QUESTIONS');
    return {
      subscribed,
      dailyLimit,
      usedToday,
      remainingToday: Math.max(0, dailyLimit - usedToday),
      plan: null,
    };
  }

  /**
   * Throws when one more answer would exceed the free allowance. Checked
   * before the write rather than enforced by a constraint: two answers racing
   * in the same instant can overshoot by one, which costs nothing.
   */
  async assertCanAnswer(userId: string): Promise<void> {
    const access = await this.describe(userId);
    if (access.remainingToday !== null && access.remainingToday <= 0) {
      throw new ForbiddenException({
        code: 'PYQ_DAILY_LIMIT_REACHED',
        message: `You have used today's ${access.dailyLimit} free questions. Upgrade for unlimited practice.`,
        dailyLimit: access.dailyLimit,
      });
    }
  }

  /**
   * The live plan entitlement with the furthest expiry (perpetual first).
   * Same rule as `isSubscribed`: ACTIVE and not yet expired.
   */
  private async currentPlan(userId: string): Promise<PyqAccess['plan']> {
    const rows = await this.prisma.entitlement.findMany({
      where: {
        userId,
        status: EntitlementStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        product: { deletedAt: null, metadata: { path: [PYQ_SUBSCRIPTION_METADATA_KEY], equals: true } },
      },
      select: { productId: true, expiresAt: true, product: { select: { title: true } } },
    });
    if (rows.length === 0) return null;
    rows.sort((a, b) => (b.expiresAt?.getTime() ?? Infinity) - (a.expiresAt?.getTime() ?? Infinity));
    const best = rows[0];
    return {
      productId: best.productId,
      title: best.product.title,
      expiresAt: best.expiresAt ? best.expiresAt.toISOString() : null,
    };
  }

  private answeredToday(userId: string): Promise<number> {
    return this.prisma.attempt.count({
      where: { userId, answeredAt: { gte: startOfIndiaDay() } },
    });
  }
}
