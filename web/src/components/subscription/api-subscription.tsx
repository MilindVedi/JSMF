"use client";

import { Check, CreditCard, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@jsmf/core/api";
import type { PyqAccess, PyqPlan } from "@jsmf/core/data-source";
import { planPeriodLabel } from "@jsmf/core/domain";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess, usePlans, useStartTrial } from "@/hooks/pyq";
import { usePlanCheckout } from "@/hooks/pyq/plans";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function rupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** The "Your current plan" lines, for each of the four states a student can be in. */
function CurrentPlan({ access }: { access: PyqAccess }) {
  const { plan, trial } = access;
  if (plan) {
    return (
      <>
        <p className="font-heading text-lg font-semibold text-foreground">{plan.title}</p>
        <p className="text-sm text-muted-foreground">
          {trial
            ? `Your free trial runs until ${formatDate(trial.endsAt)}; this plan then continues${
                plan.expiresAt ? ` until ${formatDate(plan.expiresAt)}` : ""
              }.`
            : plan.expiresAt
              ? `Active until ${formatDate(plan.expiresAt)}`
              : "Active, no end date"}
        </p>
      </>
    );
  }
  if (trial) {
    return (
      <>
        <p className="font-heading text-lg font-semibold text-foreground">Free trial</p>
        <p className="text-sm text-muted-foreground">
          Unlimited practice until {formatDate(trial.endsAt)}. Buy a plan any time — it starts when your trial ends.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="font-heading text-lg font-semibold text-foreground">Free</p>
      <p className="text-sm text-muted-foreground">
        {access.dailyLimit ?? 0} questions a day
        {access.remainingToday != null ? ` · ${access.remainingToday} left today` : ""}
      </p>
    </>
  );
}

/** /subscription against the backend: real plans, the free trial, Razorpay checkout, live access. */
export function ApiSubscription() {
  const plans = usePlans();
  const access = useAccess();
  const startTrial = useStartTrial();
  const profile = useAuthStore((s) => s.profile);
  const { pay, busy } = usePlanCheckout();

  const current = access.data?.plan ?? null;
  const trial = access.data?.trial ?? null;
  const offer = access.data?.trialOffer ?? null;

  async function handleBuy(plan: PyqPlan) {
    const outcome = await pay(plan, { name: profile.name, email: profile.email || null });
    if (outcome.status === "paid") toast.success(`${plan.name} is active. Unlimited practice unlocked.`);
    else if (outcome.status === "pending-confirmation") toast.info(outcome.message);
    else if (outcome.status === "failed") toast.error(outcome.message);
  }

  function handleStartTrial() {
    startTrial.mutate(undefined, {
      onSuccess: (next) =>
        toast.success(
          next.trial ? `Your free trial is on until ${formatDate(next.trial.endsAt)}.` : "Your free trial has started."
        ),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Your trial could not be started. Please try again."),
    });
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
            {access.isLoading || !access.data ? (
              <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" />
            ) : (
              <CurrentPlan access={access.data} />
            )}
          </div>
        </CardContent>
      </Card>

      {offer && (
        <Card className="ring-1 ring-primary/30">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
                <Gift className="size-5" />
              </div>
              <div>
                <p className="font-heading text-lg font-semibold text-foreground">
                  Try everything free for {offer.days} {offer.days === 1 ? "day" : "days"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Unlimited practice, no payment needed. One trial per account — it starts the moment you tap.
                </p>
              </div>
            </div>
            <Button onClick={handleStartTrial} disabled={startTrial.isPending} className="shrink-0">
              {startTrial.isPending ? <Loader2 className="size-4 animate-spin" /> : "Start free trial"}
            </Button>
          </CardContent>
        </Card>
      )}

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
          {plans.data.map((plan) => {
            const months = plan.durationMonths ?? 0;
            return (
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
                  <div>
                    <p className="font-heading text-3xl font-semibold tracking-tight">
                      {rupees(plan.price)}
                      <span className="text-sm font-normal text-muted-foreground">/{planPeriodLabel(plan)}</span>
                      {plan.compareAtPrice !== null && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground line-through">
                          {rupees(plan.compareAtPrice)}
                        </span>
                      )}
                    </p>
                    {months > 1 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {rupees(Math.round(plan.price / months))} a month
                      </p>
                    )}
                  </div>
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
            );
          })}
        </div>
      )}

      {(current || trial) && (
        <p className="text-center text-xs text-muted-foreground">
          {current
            ? "Buying again while active adds the new period on top of your current end date."
            : "A plan bought during your trial starts when the trial ends — you keep every trial day."}
        </p>
      )}
    </div>
  );
}
