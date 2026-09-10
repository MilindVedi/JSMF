import { PLANS } from "@/data/mock/plans";
import { PricingCard } from "@/components/marketing/pricing-card";

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-muted-foreground">
          Final pricing isn&apos;t locked in yet — the plans below show how entitlements differ by
          exam coverage and features so you can see what each tier unlocks.
        </p>
      </div>

      <div className="mt-16 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}
