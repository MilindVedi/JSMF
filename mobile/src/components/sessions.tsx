import { View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { accuracyTone, SESSION_MODE_LABEL } from "@jsmf/core/domain";
import type { SessionListItem } from "@jsmf/core/data-source";
import { useColors } from "@/theme/theme";
import { Badge, PressableCard } from "@/components/ui/primitives";
import { Txt } from "@/components/ui/text";

/** A finished session in a list (web's TestSummaryCard / SessionHistoryRow). Opens its results. */
export function SessionSummaryRow({ item, showMode = false }: { item: SessionListItem; showMode?: boolean }) {
  const router = useRouter();
  const colors = useColors();
  const { session, accuracy, correct, incorrect, unattempted } = item;
  return (
    <PressableCard className="flex-row items-center gap-3 p-3.5" onPress={() => router.push({ pathname: "/session/[id]/results", params: { id: session.id } })}>
      <View className="flex-1 gap-1">
        <Txt weight={600} className="text-sm" numberOfLines={1}>
          {session.label}
        </Txt>
        {showMode ? <Badge label={SESSION_MODE_LABEL[session.mode]} tone="muted" /> : null}
        <Txt className="text-xs text-muted-foreground" numberOfLines={1}>
          {session.completedAt ? format(new Date(session.completedAt), "MMM d, yyyy") : ""} · {correct} correct · {incorrect} incorrect
          {showMode && unattempted > 0 ? ` · ${unattempted} skipped` : ""}
        </Txt>
      </View>
      <Badge label={`${accuracy}%`} tone={accuracyTone(accuracy)} />
      <ChevronRight size={16} color={colors["muted-foreground"]} />
    </PressableCard>
  );
}
