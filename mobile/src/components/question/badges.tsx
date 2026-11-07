import { View } from "react-native";
import { EXAM_LABEL, type ExamId } from "@jsmf/core/domain";
import { useTaxonomyLookup } from "@jsmf/core/hooks";
import { useColors } from "@/theme/theme";
import { cn, Txt } from "@/components/ui/text";

/** The exam (and, given one, the year) as a small lavender pill: "FMGE 2025". */
export function ExamBadge({ examId, year, className }: { examId: ExamId | string; year?: number; className?: string }) {
  return (
    <View className={cn("rounded-full bg-accent px-2 py-0.5", className)}>
      <Txt weight={700} className="text-[10px] text-primary">
        {EXAM_LABEL[examId as ExamId] ?? examId.toUpperCase()}
        {year ? ` ${year}` : ""}
      </Txt>
    </View>
  );
}

/** Subject name with its group's dot (pre-clinical / para-clinical / clinical). */
export function SubjectBadge({ subjectId, className }: { subjectId: string; className?: string }) {
  const subject = useTaxonomyLookup().subject(subjectId);
  const colors = useColors();
  if (!subject) return null;
  const dot = subject.group === "clinical" ? colors["chart-1"] : subject.group === "para-clinical" ? colors["chart-2"] : colors["chart-5"];
  return (
    <View className={cn("flex-row items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-0.5", className)}>
      <View className="size-1.5 rounded-full" style={{ backgroundColor: dot }} />
      <Txt weight={500} className="text-[11px] text-secondary-foreground" numberOfLines={1}>
        {subject.name}
      </Txt>
    </View>
  );
}
