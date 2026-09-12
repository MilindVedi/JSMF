"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types";

interface PricingCardProps {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  onSelect: () => void;
  /** When set, disables the CTA (even for a non-current plan) and shows this
   *  reason below it — used to keep plan-switching honest in the mock, where
   *  switching to a lower tier isn't actually enforced anywhere yet. */
  disabledReason?: string;
}

export function PricingCard({ plan, isCurrent, onSelect, disabledReason }: PricingCardProps) {
  return (
    <Card
      className={cn(
        "relative flex flex-col",
        plan.highlight ? "ring-2 ring-primary" : "ring-1 ring-foreground/10"
      )}
    >
      {plan.highlight && (
        <Badge className="absolute top-3 right-3 bg-accent text-accent-foreground">
          Most Popular
        </Badge>
      )}
      <CardHeader>
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <CardDescription>{plan.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div>
          <p className="font-heading text-3xl font-semibold tracking-tight">
            ₹{plan.priceMonthly}
            <span className="text-sm font-normal text-muted-foreground">/month</span>
          </p>
          {plan.priceYearly !== undefined && (
            <p className="text-xs text-muted-foreground">or ₹{plan.priceYearly}/year</p>
          )}
        </div>
        <ul className="space-y-2">
          {plan.entitlements.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span className="text-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-1.5">
        <Button
          className="w-full"
          variant={isCurrent ? "secondary" : plan.highlight ? "default" : "outline"}
          disabled={isCurrent || Boolean(disabledReason)}
          onClick={onSelect}
        >
          {isCurrent ? "Current Plan" : "Switch to this plan"}
        </Button>
        {!isCurrent && disabledReason && (
          <p className="text-center text-xs text-muted-foreground">{disabledReason}</p>
        )}
      </CardFooter>
    </Card>
  );
}
