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
  note?: string;
  features: string[];
  highlight: boolean;
}

const PERIOD_LABEL: Record<string, string> = { month: "month", quarter: "3 months", year: "year" };

/** Pricing changes rarely: one backend request per 5 minutes, however many visitors. */
const REVALIDATE_SECONDS = 300;

interface WirePlan {
  id: string;
  title: string;
  subtitle: string | null;
  priceAmountMinor: string;
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
    return plans.map((plan) => ({
      id: plan.id,
      name: plan.title,
      tagline: plan.subtitle ?? "",
      price: Number(plan.priceAmountMinor) / 100,
      periodLabel: (plan.period && PERIOD_LABEL[plan.period]) ?? `${plan.durationDays} days`,
      features: plan.features,
      highlight: plan.popular,
    }));
  } catch {
    return null;
  }
}
