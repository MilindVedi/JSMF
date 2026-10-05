import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS } from "@/data/mock/plans";

export function CtaSection() {
  return (
    <section className="bg-brand-deep py-20 text-brand-on-deep sm:py-28">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-6 px-4 text-center sm:px-6">
        <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to start practicing?
        </h2>
        <p className="max-w-xl text-brand-on-deep/80">
          Start free, then upgrade to unlock unlimited practice for one exam or all three.
        </p>

        <div className="mt-4 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
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
                {plan.priceMonthly === 0 ? "Free" : `₹${plan.priceMonthly}`}
                {plan.priceMonthly > 0 && (
                  <span className="text-xs font-normal text-brand-on-deep/70">/mo</span>
                )}
              </p>
              <ul className="space-y-1.5 text-xs text-brand-on-deep/80">
                {plan.entitlements.features.slice(0, 2).map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-on-deep px-6 text-sm font-semibold text-brand-deep transition-colors hover:bg-brand-on-deep/90"
          >
            Start practicing free
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-brand-on-deep/30 px-6 text-sm font-semibold text-brand-on-deep transition-colors hover:bg-brand-on-deep/10"
          >
            Compare plans
          </Link>
        </div>
      </div>
    </section>
  );
}
