import { memo, useState } from "react";
import { View } from "react-native";
import { ArrowRight, Bookmark, Check, Library, X } from "lucide-react-native";
import type { PublicQuestion, QuestionStatus } from "@jsmf/core/domain";
import { useBookmarkToggle, useCollections, useTaxonomyLookup } from "@jsmf/core/hooks";
import { IconButton } from "@/components/ui/button";
import { PressableCard } from "@/components/ui/primitives";
import { cn, Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";
import { ExamBadge } from "./badges";
import { CollectionSheet } from "./collection-sheet";

/** How an attempted question went; nothing for one not tried yet (the card itself says "Solve"). */
function StatusDot({ status }: { status: QuestionStatus }) {
  const colors = useColors();
  if (status === "correct") {
    return (
      <View accessibilityLabel="Answered correctly" className="size-5 items-center justify-center rounded-full bg-success">
        <Check size={12} strokeWidth={3} color={colors["success-foreground"]} />
      </View>
    );
  }
  if (status === "incorrect") {
    return (
      <View accessibilityLabel="Answered incorrectly" className="size-5 items-center justify-center rounded-full bg-error">
        <X size={12} strokeWidth={3} color={colors["error-foreground"]} />
      </View>
    );
  }
  return null;
}

/**
 * One question in a list (web's QuestionListRow), as its own card: exam and
 * year, subject, the question's opening, and "Solve →"; bookmark and collect
 * in place. `compact` is the quieter tile used inside Revision's sections.
 */
export const QuestionRow = memo(function QuestionRow({
  question,
  status = "unattempted",
  number,
  onPress,
  compact = false,
}: {
  question: PublicQuestion;
  status?: QuestionStatus;
  number?: number;
  onPress: () => void;
  compact?: boolean;
}) {
  const bookmarks = useBookmarkToggle();
  const { data: collections = [] } = useCollections();
  const lookup = useTaxonomyLookup();
  const colors = useColors();
  const [collectOpen, setCollectOpen] = useState(false);
  const isBookmarked = bookmarks.isBookmarked(question.id);
  const inCollections = collections.filter((c) => c.questionIds.includes(question.id)).length;
  const subject = lookup.subject(question.subjectId)?.name;
  const topic = question.topicId ? lookup.topic(question.topicId)?.name : undefined;
  const where = compact && topic ? `${subject ?? ""} · ${topic}` : subject;

  return (
    <PressableCard
      className={cn("gap-1.5", compact ? "rounded-xl border border-border bg-background p-3" : "p-4")}
      onPress={onPress}
      accessibilityLabel={`Practise question ${number ?? ""}: ${question.stem.slice(0, 80)}`}
    >
      <View className="flex-row items-start gap-2">
        <View className="flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-1 pt-1">
          <StatusDot status={status} />
          {number != null ? (
            <Txt weight={700} className="text-[11px] text-muted-foreground">
              Q{number}
            </Txt>
          ) : null}
          <ExamBadge examId={question.examId} year={question.year} />
          {where ? (
            <Txt className={cn("shrink text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")} numberOfLines={1}>
              {where}
            </Txt>
          ) : null}
        </View>
        <View className="-mr-2 -mt-1 flex-row items-center">
          <IconButton
            icon={Library}
            label={inCollections > 0 ? `In ${inCollections} collections` : "Add to collection"}
            active={inCollections > 0}
            onPress={() => setCollectOpen(true)}
            className="size-9"
          />
          <IconButton
            icon={Bookmark}
            label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
            active={isBookmarked}
            activeColor={colors.primary}
            filled
            onPress={() => bookmarks.toggle(question.id, isBookmarked)}
            className="size-9"
          />
        </View>
      </View>
      <Txt className={compact ? "text-xs leading-5" : "text-sm leading-[22px]"} numberOfLines={compact ? 2 : 3}>
        {question.stem}
      </Txt>
      {compact ? null : (
        <View className="flex-row items-center gap-1">
          <Txt weight={700} className="text-xs text-primary">
            Solve
          </Txt>
          <ArrowRight size={14} color={colors.primary} strokeWidth={2.4} />
        </View>
      )}
      {collectOpen ? <CollectionSheet questionId={question.id} open onClose={() => setCollectOpen(false)} /> : null}
    </PressableCard>
  );
});
