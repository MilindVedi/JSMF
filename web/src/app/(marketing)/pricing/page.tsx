import { PricingCard } from "@/components/marketing/pricing-card";
import { DATA_SOURCE_KIND } from "@/lib/data-source/kind";
import { getMarketingPlans } from "@/lib/server/marketing-plans";

// Rendered per request so a deploy never serves a copy built without the
// backend; the plans fetch itself is cached, so the backend sees at most one
// request every five minutes.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const plans = await getMarketingPlans();

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <span className="eyebrow">Pricing</span>
        <h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-brand-deep dark:text-foreground sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-muted-foreground">
          {DATA_SOURCE_KIND === "mock"
            ? "Final pricing isn't locked in yet — the plans below show how entitlements differ by exam coverage and features so you can see what each tier unlocks."
            : "Practise free every day. Upgrade for unlimited questions across every exam in the bank."}
        </p>
      </div>

      {plans?.length ? (
        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>
      ) : (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          {plans ? "No plans are on sale right now." : "Plans couldn't be loaded. Please refresh in a moment."}
        </p>
      )}
    </div>
  );
}
