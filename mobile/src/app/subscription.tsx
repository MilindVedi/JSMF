import { View } from "react-native";
import { CreditCard, Gift } from "lucide-react-native";
import { ApiError } from "@jsmf/core/api";
import { useAccess, useStartTrial } from "@jsmf/core/hooks";
import { toast } from "@/lib/toast";
import { useColors } from "@/theme/theme";
import { Button } from "@/components/ui/button";
import { Card, Loading, QueryError } from "@/components/ui/primitives";
import { StackScreen } from "@/components/ui/screen";
import { Heading, Txt } from "@/components/ui/text";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The student's plan, and the free trial when one is on offer (web's
 * /subscription without the buying). App-store rules: the app sells nothing —
 * no plans, no prices, no buy buttons and no pointers to buying elsewhere. The
 * trial costs nothing, so it can start here as on web.
 */
export default function SubscriptionScreen() {
  const access = useAccess();
  const startTrial = useStartTrial();
  const colors = useColors();
  const plan = access.data?.plan ?? null;
  const trial = access.data?.trial ?? null;
  const offer = access.data?.trialOffer ?? null;

  function handleStartTrial() {
    startTrial.mutate(undefined, {
      onSuccess: (next) => toast.success(next.trial ? `Your free trial is on until ${formatDate(next.trial.endsAt)}.` : "Your free trial has started."),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Your trial could not be started. Please try again."),
    });
  }
  return (
    <StackScreen title="Your plan">
      {access.error ? (
        <QueryError error={access.error} onRetry={() => void access.refetch()} title="Couldn't load your plan" />
      ) : !access.data ? (
        <Loading />
      ) : (
        <Card className="flex-row items-start gap-3">
          <View className="size-10 items-center justify-center rounded-full bg-primary/10">
            <CreditCard size={20} color={colors.primary} />
          </View>
          <View className="flex-1">
            <Txt weight={500} className="text-xs text-muted-foreground">
              Your current plan
            </Txt>
            {plan ? (
              <>
                <Heading className="text-lg">{plan.title}</Heading>
                <Txt className="text-sm text-muted-foreground">
                  {trial
                    ? `Free trial until ${formatDate(trial.endsAt)}, then this plan${plan.expiresAt ? ` until ${formatDate(plan.expiresAt)}` : ""}`
                    : plan.expiresAt
                      ? `Active until ${formatDate(plan.expiresAt)}`
                      : "Active, no end date"}
                </Txt>
              </>
            ) : trial ? (
              <>
                <Heading className="text-lg">Free trial</Heading>
                <Txt className="text-sm text-muted-foreground">Unlimited practice until {formatDate(trial.endsAt)}</Txt>
              </>
            ) : (
              <>
                <Heading className="text-lg">Free</Heading>
                <Txt className="text-sm text-muted-foreground">
                  {access.data.dailyLimit ?? 0} questions a day
                  {access.data.remainingToday != null ? ` · ${access.data.remainingToday} left today` : ""}
                </Txt>
              </>
            )}
          </View>
        </Card>
      )}
      {offer ? (
        <Card className="gap-4 border-primary/30">
          <View className="flex-row items-start gap-3">
            <View className="size-10 items-center justify-center rounded-full bg-accent">
              <Gift size={20} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Heading weight={700} className="text-lg">
                Try everything free for {offer.days} {offer.days === 1 ? "day" : "days"}
              </Heading>
              <Txt className="text-sm text-muted-foreground">Unlimited practice, no payment needed. One trial per account — it starts the moment you tap.</Txt>
            </View>
          </View>
          <Button label="Start free trial" size="lg" loading={startTrial.isPending} disabled={startTrial.isPending} onPress={handleStartTrial} />
        </Card>
      ) : null}
    </StackScreen>
  );
}
