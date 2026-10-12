import { View } from "react-native";
import { CreditCard } from "lucide-react-native";
import { useAccess } from "@jsmf/core/hooks";
import { useColors } from "@/theme/theme";
import { Card, Loading, QueryError } from "@/components/ui/primitives";
import { StackScreen } from "@/components/ui/screen";
import { Heading, Txt } from "@/components/ui/text";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The student's plan, read-only. App-store rules: the app sells nothing —
 * no plans, no prices, no buy buttons and no pointers to buying elsewhere.
 */
export default function SubscriptionScreen() {
  const access = useAccess();
  const colors = useColors();
  const plan = access.data?.plan ?? null;
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
                <Txt className="text-sm text-muted-foreground">{plan.expiresAt ? `Active until ${formatDate(plan.expiresAt)}` : "Active, no end date"}</Txt>
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
    </StackScreen>
  );
}
