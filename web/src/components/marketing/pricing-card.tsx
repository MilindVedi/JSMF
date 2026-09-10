import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types";

export function PricingCard({ plan }: { plan: SubscriptionPlan }) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-6 rounded-2xl border bg-card p-6 sm:p-8",
        plan.highlight ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
          Most Popular
        </span>
      )}

      <div>
        <h3 className="font-heading text-lg font-bold text-foreground">{plan.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
      </div>

      <div>
        <div className="flex items-baseline gap-1">
          <span className="font-heading text-3xl font-bold text-foreground">
            ₹{plan.priceMonthly}
          </span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
        {plan.priceYearly !== undefined && (
          <p className="mt-1 text-xs text-muted-foreground">or ₹{plan.priceYearly}/year</p>
        )}
      </div>

      <ul className="flex flex-1 flex-col gap-2.5">
        {plan.entitlements.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            {feature}
          </li>
        ))}
      </ul>

      <Link
        href="/signup"
        className={cn(
          "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors",
          plan.highlight
            ? "bg-primary text-primary-foreground hover:bg-primary/80"
            : "border border-border bg-background text-foreground hover:bg-muted"
        )}
      >
        Get started
      </Link>
    </div>
  );
}
