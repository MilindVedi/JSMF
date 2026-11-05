import { Prisma } from '@prisma/client';

/**
 * A PYQ subscription plan is an ordinary product whose `metadata` carries
 * `{"pyqSubscription": true, "durationMonths": N}` (older plans:
 * `"durationDays": N`). This file is the one place that reads that shape,
 * shared by checkout/settlement (orders), the storefront exclusion
 * (catalog/library), the plans endpoint and the plan admin (questions).
 *
 * A plan's price and length never change once it exists. Changing either
 * creates a new product and retires this one with `supersededBy` pointing at
 * the replacement (PyqPlanAdminService), so an order is always settled on the
 * terms its buyer saw at checkout.
 */
export const PYQ_PLAN_KEY = 'pyqSubscription';

export interface PyqPlanTerms {
  /** Calendar months. Set on every plan made from the admin page. */
  durationMonths: number | null;
  /** Legacy plans only: a fixed number of days. Null when `durationMonths` is set. */
  durationDays: number | null;
  /** Display hint from older plans ("month", "quarter", "year"). */
  period: string | null;
  popular: boolean;
  /** The plan that replaced this one, when its price or length changed. */
  supersededBy: string | null;
}

/** The most months a plan may run. The admin DTO enforces the same bound. */
export const MAX_PLAN_MONTHS = 36;

function positiveInt(value: unknown, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

/** Null when the metadata is not a PYQ plan (or has no usable length). */
export function readPyqPlan(metadata: unknown): PyqPlanTerms | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  if (meta[PYQ_PLAN_KEY] !== true) return null;
  const durationMonths = positiveInt(meta.durationMonths, MAX_PLAN_MONTHS);
  const durationDays = durationMonths ? null : positiveInt(meta.durationDays, 3660);
  if (!durationMonths && !durationDays) return null;
  return {
    durationMonths,
    durationDays,
    period: typeof meta.period === 'string' ? meta.period : null,
    popular: meta.popular === true,
    supersededBy: typeof meta.supersededBy === 'string' ? meta.supersededBy : null,
  };
}

/** Whether a product's metadata marks it as a plan, usable or not. */
export function isPyqPlanMetadata(metadata: unknown): boolean {
  return (
    !!metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>)[PYQ_PLAN_KEY] === true
  );
}

/** Prisma filter: products that ARE plans. */
export const IS_PYQ_PLAN: Prisma.ProductWhereInput = {
  metadata: { path: [PYQ_PLAN_KEY], equals: true },
};

/**
 * Prisma filter: products that are NOT plans. Written as "key absent OR not
 * true" because `NOT { path equals true }` compiles to SQL where a missing key
 * yields NULL — and NOT NULL drops every ordinary product.
 */
export const NOT_A_PYQ_PLAN: Prisma.ProductWhereInput = {
  OR: [
    { metadata: { path: [PYQ_PLAN_KEY], equals: Prisma.AnyNull } },
    { metadata: { path: [PYQ_PLAN_KEY], not: true } },
  ],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `months` calendar months after `from`, keeping the time of day. A day that
 * does not exist in the target month lands on that month's last day, so
 * 31 January + 1 month is 28 (or 29) February, never 3 March.
 */
export function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const result = new Date(from.getTime());
  result.setUTCFullYear(year, month, Math.min(from.getUTCDate(), lastDay));
  return result;
}

/** Where a term of this plan that starts at `start` ends. */
export function termEnd(start: Date, terms: Pick<PyqPlanTerms, 'durationMonths' | 'durationDays'>): Date {
  return terms.durationMonths
    ? addMonths(start, terms.durationMonths)
    : new Date(start.getTime() + (terms.durationDays ?? 0) * DAY_MS);
}

/**
 * The expiry a plan purchase produces: one term from the latest of now, the
 * current expiry and the end of a running free trial. Renewing early never
 * loses paid-for days, and paying during a trial never loses trial days.
 */
export function extendedExpiry(
  current: Date | null,
  terms: Pick<PyqPlanTerms, 'durationMonths' | 'durationDays'>,
  now = new Date(),
  trialEndsAt: Date | null = null,
): Date {
  let base = now;
  if (current && current > base) base = current;
  if (trialEndsAt && trialEndsAt > base) base = trialEndsAt;
  return termEnd(base, terms);
}

/** Whole days one term would last if bought now — for display only. */
export function approximateDays(terms: Pick<PyqPlanTerms, 'durationMonths' | 'durationDays'>, now = new Date()): number {
  return Math.round((termEnd(now, terms).getTime() - now.getTime()) / DAY_MS);
}
