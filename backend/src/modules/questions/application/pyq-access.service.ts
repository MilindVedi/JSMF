import { ForbiddenException, Injectable } from '@nestjs/common';
import { EntitlementStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IS_PYQ_PLAN } from '../../../shared/pyq-plan';
import { startOfIndiaDay } from '../domain/question-view';
import { PyqSubscriptionService, type TrialView } from './pyq-subscription.service';

export interface PyqAccess {
  /** Unlimited practice right now: a live plan, or a running free trial. */
  subscribed: boolean;
  /** Null when subscribed (no limit). */
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
  /** The plan behind `subscribed`; null for free and trial users. expiresAt null = no end. */
  plan: { productId: string; title: string; expiresAt: string | null } | null;
  /**
   * The running free trial. Can be set alongside `plan` when a plan was
   * bought during the trial — the plan's time starts when the trial ends.
   */
  trial: TrialView | null;
  /** A trial this student may start now (POST /pyq/trial); null when none is on offer to them. */
  trialOffer: { days: number } | null;
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
    private readonly config: AppConfig,
    private readonly subscriptions: PyqSubscriptionService,
  ) {}

  async describe(userId: string): Promise<PyqAccess> {
    const [current, trial, usedToday] = await Promise.all([
      this.currentPlan(userId),
      this.subscriptions.activeTrial(userId),
      this.answeredToday(userId),
    ]);
    if (current || trial) {
      return {
        subscribed: true,
        dailyLimit: null,
        usedToday,
        remainingToday: null,
        plan: current,
        trial,
        trialOffer: null,
      };
    }
    const dailyLimit = this.config.get('PYQ_FREE_DAILY_QUESTIONS');
    return {
      subscribed: false,
      dailyLimit,
      usedToday,
      remainingToday: Math.max(0, dailyLimit - usedToday),
      plan: null,
      trial: null,
      trialOffer: await this.subscriptions.offerFor(userId),
    };
  }

  /**
   * Throws when one more answer would exceed the free allowance. Checked
   * before the write rather than enforced by a constraint: two answers racing
   * in the same instant can overshoot by one, which costs nothing.
   *
   * On the path of every answer, so it skips what only the access page needs
   * (the trial offer) and stops as soon as access is known to be unlimited.
   */
  async assertCanAnswer(userId: string): Promise<void> {
    const [current, trial] = await Promise.all([
      this.currentPlan(userId),
      this.subscriptions.activeTrial(userId),
    ]);
    if (current || trial) return;

    const dailyLimit = this.config.get('PYQ_FREE_DAILY_QUESTIONS');
    if ((await this.answeredToday(userId)) >= dailyLimit) {
      throw new ForbiddenException({
        code: 'PYQ_DAILY_LIMIT_REACHED',
        message: `You have used today's ${dailyLimit} free questions. Upgrade for unlimited practice.`,
        dailyLimit,
      });
    }
  }

  /**
   * The live plan entitlement with the furthest expiry (perpetual first):
   * ACTIVE and not yet expired. A plan retired from sale (unpublished, or
   * replaced by a new version) still counts for whoever holds it.
   */
  private async currentPlan(userId: string): Promise<PyqAccess['plan']> {
    const rows = await this.prisma.entitlement.findMany({
      where: {
        userId,
        status: EntitlementStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        product: { deletedAt: null, ...IS_PYQ_PLAN },
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
