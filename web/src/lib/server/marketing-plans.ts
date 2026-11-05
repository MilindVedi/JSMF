import { planPeriodLabel } from "@jsmf/core/domain";
import { PLANS } from "@/data/mock/plans";
import { DATA_SOURCE_KIND } from "@/lib/data-source/kind";
import { backendOrigin, getGoogleIdToken } from "./backend";

/** What a marketing plan card shows — the same for mock and real plans. */
export interface MarketingPlan {
  id: string;
  name: string;
  tagline: string;
  /** Rupees. */
  price: number;
  /** "month", "3 months", "year", or "N days". */
  periodLabel: string;
  /** The struck-through "was" price in rupees, when set. */
  compareAtPrice?: number;
  note?: string;
  features: string[];
  highlight: boolean;
}

/** Pricing changes rarely: one backend request per 5 minutes, however many visitors. */
const REVALIDATE_SECONDS = 300;

interface WirePlan {
  id: string;
  title: string;
  subtitle: string | null;
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  durationMonths: number | null;
  durationDays: number;
  period: string | null;
  popular: boolean;
  features: string[];
}

/**
 * Plans for the public pages, rendered on the server so visitors' browsers
 * make no request at all. Null when the backend cannot be reached — the page
 * then says so instead of showing prices that may be wrong.
 */
export async function getMarketingPlans(): Promise<MarketingPlan[] | null> {
  if (DATA_SOURCE_KIND === "mock") {
    return PLANS.map((plan) => ({
      id: plan.id,
      name: plan.name,
      tagline: plan.tagline,
      price: plan.priceMonthly,
      periodLabel: "month",
      note: plan.priceYearly !== undefined ? `or ₹${plan.priceYearly}/year` : undefined,
      features: plan.entitlements.features,
      highlight: Boolean(plan.highlight),
    }));
  }

  const origin = backendOrigin();
  try {
    const token = await getGoogleIdToken(origin);
    const response = await fetch(`${origin}/api/pyq/plans`, {
      headers: token ? { "X-Serverless-Authorization": `Bearer ${token}` } : {},
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const plans = (await response.json()) as WirePlan[];
    return plans.map((plan) => {
      const price = Number(plan.priceAmountMinor) / 100;
      const months = plan.durationMonths ?? 0;
      return {
        id: plan.id,
        name: plan.title,
        tagline: plan.subtitle ?? "",
        price,
        periodLabel: planPeriodLabel(plan),
        compareAtPrice: plan.compareAtAmountMinor ? Number(plan.compareAtAmountMinor) / 100 : undefined,
        // What a longer plan works out to a month — how buyers compare them.
        note: months > 1 ? `₹${Math.round(price / months).toLocaleString("en-IN")} a month` : undefined,
        features: plan.features,
        highlight: plan.popular,
      };
    });
  } catch {
    return null;
  }
}

/** Whether a free trial is on offer, and how long — for the pricing copy. */
export interface MarketingTrial {
  days: number;
}

/**
 * The trial offer for the public pages, or null when trials are off or the
 * backend cannot be reached (the page then simply doesn't mention one —
 * never promise a trial that may not exist). Whether a given visitor is
 * eligible is decided only after they sign in.
 */
export async function getMarketingTrial(): Promise<MarketingTrial | null> {
  if (DATA_SOURCE_KIND === "mock") return null;
  const origin = backendOrigin();
  try {
    const token = await getGoogleIdToken(origin);
    const response = await fetch(`${origin}/api/pyq/trial`, {
      headers: token ? { "X-Serverless-Authorization": `Bearer ${token}` } : {},
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const offer = (await response.json()) as { enabled: boolean; days: number | null };
    return offer.enabled && offer.days ? { days: offer.days } : null;
  } catch {
    return null;
  }
}
