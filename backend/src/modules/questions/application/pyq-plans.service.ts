import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IS_PYQ_PLAN, approximateDays, readPyqPlan } from '../../../shared/pyq-plan';
import { PyqSubscriptionService } from './pyq-subscription.service';

const PLANS_CACHE_KEY = 'pyq:plans';
const PLANS_TTL_SECONDS = 60;

export interface PyqPlanView {
  /** The product id — what `POST /orders` takes to buy it. */
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  currency: string;
  /** Calendar months; null on older day-based plans. */
  durationMonths: number | null;
  /** How long one term lasts if bought today, in whole days. Display only. */
  durationDays: number;
  period: string | null;
  popular: boolean;
  /** The shared benefits list — the same on every plan. */
  features: string[];
}

/**
 * The plans on sale: published products carrying `{"pyqSubscription": true}`,
 * managed from the admin's Plans & trial page (PyqPlanAdminService). Every
 * plan shows the same benefits, from PyqSubscriptionService; they differ only
 * in length and price.
 */
@Injectable()
export class PyqPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly subscriptions: PyqSubscriptionService,
  ) {}

  /**
   * Public and the same for everyone. Cached briefly and dropped on every
   * admin change; what a buyer is charged never comes from here — the order
   * is priced from the product itself.
   */
  list(): Promise<PyqPlanView[]> {
    return this.cache.wrap(PLANS_CACHE_KEY, PLANS_TTL_SECONDS, () => this.load());
  }

  /** Called after any plan or benefits change, so this instance shows it at once. */
  invalidate(): Promise<void> {
    return this.cache.del(PLANS_CACHE_KEY);
  }

  private async load(): Promise<PyqPlanView[]> {
    const [products, settings] = await Promise.all([
      this.prisma.product.findMany({
        where: { ...IS_PYQ_PLAN, status: ProductStatus.PUBLISHED, deletedAt: null },
        orderBy: { priceAmountMinor: 'asc' },
      }),
      this.subscriptions.settings(),
    ]);
    const plans: PyqPlanView[] = [];
    for (const product of products) {
      const terms = readPyqPlan(product.metadata);
      if (!terms || terms.supersededBy) continue;
      plans.push({
        id: product.id,
        slug: product.slug,
        title: product.title,
        subtitle: product.subtitle,
        priceAmountMinor: product.priceAmountMinor.toString(),
        compareAtAmountMinor: product.compareAtAmountMinor?.toString() ?? null,
        currency: product.currency,
        durationMonths: terms.durationMonths,
        durationDays: approximateDays(terms),
        period: terms.period,
        popular: terms.popular,
        features: settings.features,
      });
    }
    // Shortest first, the order a buyer compares them in.
    return plans.sort((a, b) => a.durationDays - b.durationDays);
  }
}
