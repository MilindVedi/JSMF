import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EXAMS } from "@/data/mock/exams";
import type { SubscriptionPlan } from "@/types";

export function CurrentPlanBanner({ plan }: { plan: SubscriptionPlan }) {
  const unlockedExams = plan.entitlements.examIds
    .map((id) => EXAMS.find((e) => e.id === id)?.shortName)
    .filter(Boolean);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CreditCard className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Your current plan</p>
            <p className="font-heading text-lg font-semibold text-foreground">{plan.name}</p>
            <p className="text-sm text-muted-foreground">{plan.tagline}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {unlockedExams.length > 0 ? (
            unlockedExams.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              No exam unlocked yet
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
