import { View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { CircleCheck } from "lucide-react-native";
import { formatMarks, SESSION_MODE_LABEL } from "@jsmf/core/domain";
import type { SessionListItem } from "@jsmf/core/data-source";
import { useColors } from "@/theme/theme";
import { Badge, PressableCard } from "@/components/ui/primitives";
import { ScorePill } from "@/components/ui/score";
import { Txt } from "@/components/ui/text";

/** A finished session in a list (web's TestSummaryCard / SessionHistoryRow): its score in its band's colour. Opens its results. */
export function SessionSummaryRow({ item, showMode = false }: { item: SessionListItem; showMode?: boolean }) {
  const router = useRouter();
  const colors = useColors();
  const { session, accuracy, correct, incorrect, unattempted, marks } = item;
  return (
    <PressableCard
      className="flex-row items-center gap-3 p-3.5"
      onPress={() => router.push({ pathname: "/session/[id]/results", params: { id: session.id } })}
      accessibilityLabel={`${session.label}, ${accuracy}% accuracy`}
    >
      <View className="size-9 items-center justify-center rounded-xl bg-accent">
        <CircleCheck size={17} color={colors.primary} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-1">
        <Txt weight={700} className="text-sm" numberOfLines={1}>
          {session.label}
        </Txt>
        {showMode ? <Badge label={SESSION_MODE_LABEL[session.mode]} tone="muted" /> : null}
        <Txt className="text-[11px] text-muted-foreground" numberOfLines={1}>
          {session.completedAt ? format(new Date(session.completedAt), "MMM d, yyyy") : ""} · {correct} correct · {incorrect} incorrect
          {showMode && unattempted > 0 ? ` · ${unattempted} skipped` : ""}
        </Txt>
      </View>
      {/* Only a full mock is marked; web shows its marks before the accuracy. */}
      {marks ? (
        <Txt weight={600} className="text-sm">
          {formatMarks(marks.scored)}
          <Txt className="text-xs text-muted-foreground">/{formatMarks(marks.max)}</Txt>
        </Txt>
      ) : null}
      <ScorePill value={accuracy} />
    </PressableCard>
  );
}
