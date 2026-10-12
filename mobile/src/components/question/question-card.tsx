import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Activity, Bone, Camera, Check, CircleCheck, Circle, CircleX, Microscope, Scan, ScanLine, Workflow, X } from "lucide-react-native";
import { DIFFICULTY_LABEL, OPTION_LETTERS, type FigureKind, type QuestionFigure, type SessionQuestion } from "@jsmf/core/domain";
import { useTaxonomyLookup } from "@jsmf/core/hooks";
import type { IconComponent } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { cn, Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";
import { ExamBadge, SubjectBadge } from "./badges";

const FIGURE_META: Record<FigureKind, { label: string; icon: IconComponent }> = {
  xray: { label: "Radiograph", icon: Bone },
  ct: { label: "CT / Cross-sectional imaging", icon: ScanLine },
  histology: { label: "Histopathology", icon: Microscope },
  ecg: { label: "ECG strip", icon: Activity },
  "clinical-photo": { label: "Clinical photograph", icon: Camera },
  diagram: { label: "Diagram", icon: Workflow },
  chart: { label: "Chart", icon: Scan },
};

/** A stand-in for a figure the content team has described but not attached (web's FigurePlaceholder). */
export function FigurePlaceholder({ figure }: { figure: QuestionFigure }) {
  const colors = useColors();
  const meta = FIGURE_META[figure.kind] ?? FIGURE_META.diagram;
  const Icon = meta.icon;
  return (
    <View className="my-2 overflow-hidden rounded-xl border border-border bg-muted/50">
      <View className="h-36 items-center justify-center gap-2">
        <View className="size-11 items-center justify-center rounded-full border border-border bg-background">
          <Icon size={20} color={colors["muted-foreground"]} strokeWidth={1.75} />
        </View>
        <Txt weight={600} className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {meta.label}
        </Txt>
      </View>
      <View className="border-t border-border bg-card px-4 py-2.5">
        <Txt className="text-sm text-muted-foreground">{figure.caption}</Txt>
      </View>
    </View>
  );
}

const DIFFICULTY_TONE = { easy: "success", medium: "flag", hard: "error" } as const;

/** Stem, figure and options. `submitted` reveals correctness (never in a running test). */
export function QuestionCard({
  question,
  submitted,
  selectedOptionId,
  onSelect,
  hideMeta = false,
}: {
  question: SessionQuestion;
  submitted: boolean;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  /** Exam mode: no exam / subject / topic / difficulty tags, as on the real test screen. */
  hideMeta?: boolean;
}) {
  const topic = useTaxonomyLookup().topic(question.topicId);
  return (
    <View className="gap-4">
      {!hideMeta ? (
        <View className="flex-row flex-wrap items-center gap-1.5">
          <ExamBadge examId={question.examId} />
          <SubjectBadge subjectId={question.subjectId} />
          {topic ? (
            <View className="rounded-full border border-border px-2 py-0.5">
              <Txt className="text-[11px] text-muted-foreground">{topic.name}</Txt>
            </View>
          ) : null}
          <Badge label={DIFFICULTY_LABEL[question.difficulty]} tone={DIFFICULTY_TONE[question.difficulty]} className="ml-auto" />
        </View>
      ) : null}
      <Txt className="text-[17px] leading-7">{question.stem}</Txt>
      {question.stemFigure ? <FigurePlaceholder figure={question.stemFigure} /> : null}
      <View accessibilityRole="radiogroup" className="gap-2.5">
        {question.options.map((option, i) => (
          <OptionButton
            key={option.id}
            index={i}
            text={option.text}
            imageUrl={option.imageUrl}
            submitted={submitted}
            isSelected={selectedOptionId === option.id}
            isCorrectOption={question.correctOptionId === option.id}
            onSelect={() => onSelect(option.id)}
          />
        ))}
      </View>
    </View>
  );
}

export function OptionButton({
  index,
  text,
  imageUrl,
  submitted,
  isSelected,
  isCorrectOption,
  onSelect,
}: {
  index: number;
  text: string;
  imageUrl?: string;
  submitted: boolean;
  isSelected: boolean;
  isCorrectOption: boolean;
  onSelect: () => void;
}) {
  const colors = useColors();
  const showCorrect = submitted && isCorrectOption;
  const showWrong = submitted && isSelected && !isCorrectOption;
  const muted = submitted && !isSelected && !isCorrectOption;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected, disabled: submitted }}
      accessibilityLabel={`Option ${OPTION_LETTERS[index]}: ${text}`}
      disabled={submitted}
      onPress={onSelect}
      className={cn(
        "flex-row items-start gap-3 rounded-2xl border px-4 py-3.5",
        !submitted && !isSelected && "border-border bg-card active:bg-muted/60",
        !submitted && isSelected && "border-primary bg-primary/5",
        showCorrect && "border-success-foreground/30 bg-success",
        showWrong && "border-error-foreground/30 bg-error",
        muted && "border-border bg-card opacity-60"
      )}
      style={!submitted && isSelected ? { borderWidth: 1.5 } : undefined}
    >
      <View
        className={cn(
          "mt-0.5 size-7 items-center justify-center rounded-full border",
          !submitted && !isSelected && "border-border",
          !submitted && isSelected && "border-primary bg-primary",
          showCorrect && "border-transparent bg-success-foreground",
          showWrong && "border-transparent bg-error-foreground",
          muted && "border-border"
        )}
      >
        {showCorrect ? (
          <Check size={14} strokeWidth={3} color={colors.success} />
        ) : showWrong ? (
          <X size={14} strokeWidth={3} color={colors.error} />
        ) : (
          <Txt weight={700} className={cn("text-xs", !submitted && isSelected ? "text-primary-foreground" : "text-muted-foreground")}>
            {OPTION_LETTERS[index]}
          </Txt>
        )}
      </View>
      <View className="flex-1 gap-2 pt-0.5">
        <Txt className={cn("text-base leading-6", showCorrect && "text-success-foreground", showWrong && "text-error-foreground")}>{text}</Txt>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 140, borderRadius: 10 }} contentFit="contain" /> : null}
      </View>
    </Pressable>
  );
}

/** The verdict and explanation after answering (practice), or in review. */
export function ExplanationPanel({ question, status }: { question: SessionQuestion; status: "correct" | "incorrect" | "unattempted" }) {
  const colors = useColors();
  const Icon = status === "correct" ? CircleCheck : status === "incorrect" ? CircleX : Circle;
  const color = status === "correct" ? colors["success-foreground"] : status === "incorrect" ? colors["error-foreground"] : colors["muted-foreground"];
  return (
    <View
      className={cn(
        "rounded-2xl border p-4",
        status === "correct" && "border-success-foreground/20 bg-success/60",
        status === "incorrect" && "border-error-foreground/20 bg-error/60",
        status === "unattempted" && "border-border bg-muted/50"
      )}
    >
      <View className="mb-2 flex-row items-center gap-2">
        <Icon size={18} color={color} />
        <Txt weight={700} className="text-sm" style={{ color }}>
          {status === "correct" ? "Correct" : status === "incorrect" ? "Incorrect" : "Not attempted"}
        </Txt>
      </View>
      <Txt className="text-base leading-7">{question.explanation}</Txt>
      {question.explanationFigure ? <FigurePlaceholder figure={question.explanationFigure} /> : null}
    </View>
  );
}
