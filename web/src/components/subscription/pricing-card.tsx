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
}

export function PricingCard({ plan, isCurrent, onSelect }: PricingCardProps) {
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
      <CardFooter>
        <Button
          className="w-full"
          variant={isCurrent ? "secondary" : plan.highlight ? "default" : "outline"}
          disabled={isCurrent}
          onClick={onSelect}
        >
          {isCurrent ? "Current Plan" : "Switch to this plan"}
        </Button>
      </CardFooter>
    </Card>
  );
}
