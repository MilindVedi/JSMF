"use client";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { CurrentPlanBanner } from "@/components/subscription/current-plan-banner";
import { PricingCard } from "@/components/subscription/pricing-card";
import { useAuthStore } from "@/store/auth-store";
import { PLANS, getPlanById } from "@/data/mock/plans";

export default function SubscriptionPage() {
  const profile = useAuthStore((s) => s.profile);
  const hydrated = useAuthStore((s) => s.hasHydrated);
  const upgradePlan = useAuthStore((s) => s.upgradePlan);

  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentPlan = getPlanById(profile.currentPlanId);

  function handleSelect(planId: string, planName: string) {
    upgradePlan(planId);
    toast.success(`Switched to ${planName}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription"
        description="Choose the plan that matches your exam prep — you can switch anytime."
      />

      {currentPlan && <CurrentPlanBanner plan={currentPlan} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.id === profile.currentPlanId}
            onSelect={() => handleSelect(plan.id, plan.name)}
          />
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Final pricing and plans are not yet finalized.
      </p>
    </div>
  );
}
