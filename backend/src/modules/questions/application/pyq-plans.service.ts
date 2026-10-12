import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IS_PYQ_PLAN, readPyqPlan } from '../../../shared/pyq-plan';

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
  durationDays: number;
  period: string | null;
  popular: boolean;
  features: string[];
}

/**
 * The plans on sale. A plan is an ordinary published product carrying
 * `{"pyqSubscription": true, "durationDays": N}` in its metadata, so creating,
 * repricing or retiring one is a product edit, not a deploy.
 */
@Injectable()
export class PyqPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Public and the same for everyone. Cached briefly rather than invalidated:
   * a reprice shows within a minute, and what a buyer is charged never comes
   * from here — the order is priced from the product itself.
   */
  list(): Promise<PyqPlanView[]> {
    return this.cache.wrap(PLANS_CACHE_KEY, PLANS_TTL_SECONDS, () => this.load());
  }

  private async load(): Promise<PyqPlanView[]> {
    const products = await this.prisma.product.findMany({
      where: { ...IS_PYQ_PLAN, status: ProductStatus.PUBLISHED, deletedAt: null },
      orderBy: { priceAmountMinor: 'asc' },
    });
    const plans: PyqPlanView[] = [];
    for (const product of products) {
      const terms = readPyqPlan(product.metadata);
      if (!terms) continue;
      plans.push({
        id: product.id,
        slug: product.slug,
        title: product.title,
        subtitle: product.subtitle,
        priceAmountMinor: product.priceAmountMinor.toString(),
        compareAtAmountMinor: product.compareAtAmountMinor?.toString() ?? null,
        currency: product.currency,
        ...terms,
      });
    }
    return plans;
  }
}
