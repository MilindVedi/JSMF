import { Prisma } from '@prisma/client';

/**
 * A PYQ subscription plan is an ordinary product whose `metadata` carries
 * `{"pyqSubscription": true, "durationDays": N}`. This file is the one place
 * that reads that shape, shared by checkout/settlement (orders), the
 * storefront exclusion (catalog/library) and the plans endpoint (questions).
 */
export const PYQ_PLAN_KEY = 'pyqSubscription';

export interface PyqPlanTerms {
  durationDays: number;
  features: string[];
  /** Optional display hints from metadata. */
  period: string | null;
  popular: boolean;
}

/** Null when the metadata is not a PYQ plan (or has no usable duration). */
export function readPyqPlan(metadata: unknown): PyqPlanTerms | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  if (meta[PYQ_PLAN_KEY] !== true) return null;
  const durationDays = Number(meta.durationDays);
  if (!Number.isInteger(durationDays) || durationDays <= 0) return null;
  return {
    durationDays,
    features: Array.isArray(meta.features)
      ? meta.features.filter((f): f is string => typeof f === 'string')
      : [],
    period: typeof meta.period === 'string' ? meta.period : null,
    popular: meta.popular === true,
  };
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
 * The expiry a plan purchase produces: `durationDays` from the later of now
 * and the current expiry, so renewing early never loses paid-for days.
 */
export function extendedExpiry(current: Date | null, durationDays: number, now = new Date()): Date {
  const base = current && current > now ? current : now;
  return new Date(base.getTime() + durationDays * DAY_MS);
}
