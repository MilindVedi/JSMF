"use client";

import { Check, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess } from "@/hooks/pyq";
import { usePlanCheckout, usePlans } from "@/hooks/pyq/plans";
import type { PyqPlan } from "@/lib/data-source";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

const PERIOD_LABEL: Record<string, string> = { month: "month", quarter: "3 months", year: "year" };

function periodLabel(plan: PyqPlan): string {
  return (plan.period && PERIOD_LABEL[plan.period]) ?? `${plan.durationDays} days`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** /subscription against the backend: real plans, Razorpay checkout, live access. */
export function ApiSubscription() {
  const plans = usePlans();
  const access = useAccess();
  const profile = useAuthStore((s) => s.profile);
  const { pay, busy } = usePlanCheckout();

  const current = access.data?.plan ?? null;

  async function handleBuy(plan: PyqPlan) {
    const outcome = await pay(plan, { name: profile.name, email: profile.email || null });
    if (outcome.status === "paid") toast.success(`${plan.name} is active. Unlimited practice unlocked.`);
    else if (outcome.status === "pending-confirmation") toast.info(outcome.message);
    else if (outcome.status === "failed") toast.error(outcome.message);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Subscription" description="Unlimited practice across every exam in the bank." />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CreditCard className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Your current plan</p>
            {access.isLoading ? (
              <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" />
            ) : current ? (
              <>
                <p className="font-heading text-lg font-semibold text-foreground">{current.title}</p>
                <p className="text-sm text-muted-foreground">
                  {current.expiresAt ? `Active until ${formatDate(current.expiresAt)}` : "Active, no end date"}
                </p>
              </>
            ) : (
              <>
                <p className="font-heading text-lg font-semibold text-foreground">Free</p>
                <p className="text-sm text-muted-foreground">
                  {access.data?.dailyLimit ?? 0} questions a day
                  {access.data?.remainingToday != null ? ` · ${access.data.remainingToday} left today` : ""}
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {plans.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : plans.isError ? (
        <p className="text-center text-sm text-muted-foreground">Could not load plans. Please refresh.</p>
      ) : !plans.data?.length ? (
        <p className="text-center text-sm text-muted-foreground">No plans are on sale right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.data.map((plan) => (
            <Card
              key={plan.id}
              className={cn("relative flex flex-col", plan.popular ? "ring-2 ring-primary" : "ring-1 ring-foreground/10")}
            >
              {plan.popular && (
                <Badge className="absolute top-3 right-3 bg-accent text-accent-foreground">Best value</Badge>
              )}
              <CardHeader>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                {plan.tagline && <CardDescription>{plan.tagline}</CardDescription>}
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <p className="font-heading text-3xl font-semibold tracking-tight">
                  ₹{plan.price.toLocaleString("en-IN")}
                  <span className="text-sm font-normal text-muted-foreground">/{periodLabel(plan)}</span>
                </p>
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => handleBuy(plan)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : current ? "Extend with this plan" : "Buy plan"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {current && (
        <p className="text-center text-xs text-muted-foreground">
          Buying again while active adds the new period on top of your current end date.
        </p>
      )}
    </div>
  );
}
