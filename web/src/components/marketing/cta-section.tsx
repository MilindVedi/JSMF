import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMarketingPlans } from "@/lib/server/marketing-plans";

export async function CtaSection() {
  const plans = (await getMarketingPlans()) ?? [];
  return (
    <section className="bg-brand-deep py-20 text-brand-on-deep sm:py-28">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-6 px-4 text-center sm:px-6">
        <div className="mb-2 h-px w-14 bg-brand-line" />
        <h2 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
          Ready to start practicing?
        </h2>
        <p className="max-w-xl text-brand-on-deep/80">
          Start free, then upgrade for unlimited practice.
        </p>

        {plans.length > 0 && (
        <div className="mt-4 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col gap-3 rounded-2xl border p-5 text-left",
                plan.highlight
                  ? "border-accent bg-brand-on-deep/10 ring-1 ring-accent"
                  : "border-brand-on-deep/15 bg-brand-on-deep/5"
              )}
            >
              {plan.highlight && (
                <span className="absolute top-3 right-3 rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-semibold text-accent-foreground">
                  Most Popular
                </span>
              )}
              <p className="font-heading text-sm font-semibold">{plan.name}</p>
              <p className="font-heading text-2xl font-bold">
                {plan.price === 0 ? "Free" : `₹${plan.price.toLocaleString("en-IN")}`}
                {plan.price > 0 && (
                  <span className="text-xs font-normal text-brand-on-deep/70">/{plan.periodLabel}</span>
                )}
              </p>
              <ul className="space-y-1.5 text-xs text-brand-on-deep/80">
                {plan.features.slice(0, 2).map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/signup"
            className="cta-spot flex items-center justify-center gap-2.5 rounded-full px-8 py-4 font-display text-lg font-semibold text-white"
          >
            <span className="cta-shine" aria-hidden />
            Start practicing free
            <ArrowRight size={20} strokeWidth={2.4} className="cta-arrow transition-transform duration-300" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-brand-on-deep/30 px-6 text-sm font-semibold text-brand-on-deep transition-all hover:bg-brand-on-deep/10"
          >
            Compare plans
          </Link>
        </div>
      </div>
    </section>
  );
}
