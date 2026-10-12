import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import { Bookmark, Check, ChevronRight, Circle, Library, X } from "lucide-react-native";
import type { PublicQuestion, QuestionStatus } from "@jsmf/core/domain";
import { useBookmarkToggle, useCollections } from "@jsmf/core/hooks";
import { IconButton } from "@/components/ui/button";
import { Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";
import { ExamBadge, SubjectBadge } from "./badges";
import { CollectionSheet } from "./collection-sheet";

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
  return (
    <View accessibilityLabel="Not attempted yet" className="size-5 items-center justify-center">
      <Circle size={12} strokeWidth={2.5} color={colors.border} />
    </View>
  );
}

/** One question in a list (web's QuestionListRow): tap to practise, bookmark and collect in place. */
export const QuestionRow = memo(function QuestionRow({
  question,
  status = "unattempted",
  number,
  onPress,
}: {
  question: PublicQuestion;
  status?: QuestionStatus;
  number?: number;
  onPress: () => void;
}) {
  const bookmarks = useBookmarkToggle();
  const { data: collections = [] } = useCollections();
  const colors = useColors();
  const [collectOpen, setCollectOpen] = useState(false);
  const isBookmarked = bookmarks.isBookmarked(question.id);
  const inCollections = collections.filter((c) => c.questionIds.includes(question.id)).length;
  return (
    <View className="flex-row items-start gap-1 py-3 pl-4 pr-1">
      <Pressable accessibilityRole="button" accessibilityLabel={`Practise question ${number ?? ""}`} onPress={onPress} className="flex-1 flex-row items-start gap-3 active:opacity-70">
        <View className="pt-0.5">
          <StatusDot status={status} />
        </View>
        <View className="flex-1 gap-1.5">
          <View className="flex-row flex-wrap items-center gap-1.5">
            {number != null ? (
              <Txt weight={700} className="text-xs">
                Q{number}
              </Txt>
            ) : null}
            <ExamBadge examId={question.examId} />
            <SubjectBadge subjectId={question.subjectId} />
            <Txt className="text-xs text-muted-foreground">{question.year}</Txt>
          </View>
          <Txt className="text-sm leading-5" numberOfLines={2}>
            {question.stem}
          </Txt>
        </View>
      </Pressable>
      <View className="flex-row items-center">
        <IconButton
          icon={Bookmark}
          label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
          active={isBookmarked}
          activeColor={colors.primary}
          filled
          onPress={() => bookmarks.toggle(question.id, isBookmarked)}
        />
        <IconButton icon={Library} label={inCollections > 0 ? `In ${inCollections} collections` : "Add to collection"} active={inCollections > 0} onPress={() => setCollectOpen(true)} />
        <ChevronRight size={16} color={colors["muted-foreground"]} />
      </View>
      {collectOpen ? <CollectionSheet questionId={question.id} open onClose={() => setCollectOpen(false)} /> : null}
    </View>
  );
});
