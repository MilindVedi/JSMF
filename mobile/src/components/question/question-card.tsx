import { useEffect, useRef, type ReactNode } from "react";
import { View } from "react-native";
import { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Image } from "expo-image";
import { Activity, Bone, Camera, CircleCheck, Circle, CircleX, Microscope, Scan, ScanLine, Workflow } from "lucide-react-native";
import { DIFFICULTY_LABEL, OPTION_LETTERS, type FigureKind, type QuestionFigure, type SessionQuestion } from "@jsmf/core/domain";
import { useTaxonomyLookup } from "@jsmf/core/hooks";
import { AnimatedPressable, AnimatedView } from "@/components/motion/animated";
import { usePressScale } from "@/components/motion/loop";
import { Rise } from "@/components/motion/rise";
import type { IconComponent } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { cn, Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";
import { ExamBadge } from "./badges";

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

/**
 * Stem, figure and options. `submitted` reveals correctness (never in a
 * running test). The tag line reads like the question list's: "FMGE 2025",
 * subject · topic, difficulty, then `trailing` (the bookmark) at the end.
 */
export function QuestionCard({
  question,
  submitted,
  selectedOptionId,
  onSelect,
  hideMeta = false,
  trailing,
}: {
  question: SessionQuestion;
  submitted: boolean;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  /** Exam mode: no exam / subject / topic / difficulty tags, as on the real test screen. */
  hideMeta?: boolean;
  trailing?: ReactNode;
}) {
  const lookup = useTaxonomyLookup();
  const subject = lookup.subject(question.subjectId)?.name;
  const topic = question.topicId ? lookup.topic(question.topicId)?.name : undefined;
  const where = [subject, topic].filter(Boolean).join(" · ");
  return (
    <View className="gap-4">
      {!hideMeta ? (
        <View className="flex-row items-center gap-2">
          <ExamBadge examId={question.examId} year={question.year} />
          <Txt className="flex-1 text-[11px] text-muted-foreground" numberOfLines={1}>
            {where}
          </Txt>
          <Badge label={DIFFICULTY_LABEL[question.difficulty]} tone={DIFFICULTY_TONE[question.difficulty]} />
          {trailing}
        </View>
      ) : null}
      <Txt weight={500} className="text-[15px] leading-6">
        {question.stem}
      </Txt>
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

type Verdict = "correct" | "wrong" | null;

/**
 * The answer's moment: the right option pops, a wrong pick shakes — only when
 * it happens in front of the student, not when an answered question is
 * reopened. Still under reduce-motion.
 */
function useVerdictMotion(verdict: Verdict) {
  const reduceMotion = useReducedMotion();
  const shownWith = useRef(verdict);
  const scale = useSharedValue(1);
  const shift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || verdict === null || verdict === shownWith.current) return;
    if (verdict === "correct") {
      scale.set(withSequence(withTiming(0.96, { duration: 90 }), withTiming(1.03, { duration: 150 }), withTiming(1, { duration: 120 })));
    } else {
      shift.set(withSequence(withTiming(-6, { duration: 70 }), withTiming(6, { duration: 90 }), withTiming(-3, { duration: 80 }), withTiming(0, { duration: 70 })));
    }
  }, [verdict, reduceMotion, scale, shift]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }, { scale: scale.value }] }));
}

/**
 * One answer option: its letter in a small square, the text, and after the
 * answer a tick or cross. Chosen (before submitting) it is violet-edged;
 * revealed, the right one turns green, a wrong pick red, the rest fade.
 */
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
  const press = usePressScale(0.98);
  const showCorrect = submitted && isCorrectOption;
  const showWrong = submitted && isSelected && !isCorrectOption;
  const muted = submitted && !isSelected && !isCorrectOption;
  const chosen = !submitted && isSelected;
  const verdictStyle = useVerdictMotion(showCorrect ? "correct" : showWrong ? "wrong" : null);
  const ink = showCorrect ? "text-success-foreground" : showWrong ? "text-error-foreground" : chosen ? "text-primary" : "text-foreground";
  return (
    <AnimatedView animatedStyle={verdictStyle}>
      <AnimatedPressable
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected, disabled: submitted }}
        accessibilityLabel={`Option ${OPTION_LETTERS[index]}: ${text}`}
        disabled={submitted}
        onPress={onSelect}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        className={cn(
          "flex-row items-center gap-3 rounded-2xl px-3.5 py-3",
          !submitted && !isSelected && "border-border bg-card",
          chosen && "border-primary bg-accent",
          showCorrect && "border-success-foreground bg-success",
          showWrong && "border-error-foreground bg-error",
          muted && "border-border bg-card opacity-50"
        )}
        style={{ borderWidth: 1.5 }}
        animatedStyle={press.style}
      >
        <View
          className={cn(
            "size-7 items-center justify-center self-start rounded-[9px]",
            chosen ? "bg-primary" : showCorrect ? "bg-success-foreground/15" : showWrong ? "bg-error-foreground/15" : "bg-muted"
          )}
        >
          <Txt weight={700} className={cn("text-xs", chosen ? "text-primary-foreground" : ink)}>
            {OPTION_LETTERS[index]}
          </Txt>
        </View>
        <View className="flex-1 gap-2">
          <Txt weight={chosen || showCorrect || showWrong ? 600 : 400} className={cn("text-sm leading-[21px]", ink)}>
            {text}
          </Txt>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 140, borderRadius: 10 }} contentFit="contain" /> : null}
        </View>
        {showCorrect ? <CircleCheck size={19} color={colors["success-foreground"]} /> : null}
        {showWrong ? <CircleX size={19} color={colors["error-foreground"]} /> : null}
      </AnimatedPressable>
    </AnimatedView>
  );
}

const VERDICT_LABEL = { correct: "Correct!", incorrect: "Incorrect", unattempted: "Not attempted" } as const;

/**
 * The verdict and explanation after answering (practice), or in review: a
 * lavender panel with a violet edge, rising in when it appears.
 */
export function ExplanationPanel({ question, status }: { question: SessionQuestion; status: "correct" | "incorrect" | "unattempted" }) {
  const colors = useColors();
  const Icon = status === "correct" ? CircleCheck : status === "incorrect" ? CircleX : Circle;
  const color = status === "correct" ? colors["success-foreground"] : status === "incorrect" ? colors["error-foreground"] : colors["muted-foreground"];
  return (
    <Rise distance={12} durationMs={420}>
      <View className="rounded-[18px] border-l-4 border-primary bg-accent px-4 py-3.5">
        <View className="flex-row items-center gap-1.5">
          <Icon size={15} color={color} strokeWidth={2.2} />
          <Txt weight={700} className="text-xs uppercase tracking-wider" style={{ color }}>
            {VERDICT_LABEL[status]}
          </Txt>
          <Txt weight={700} className="text-xs uppercase tracking-wider text-primary">
            · Explanation
          </Txt>
        </View>
        <Txt className="mt-1.5 text-sm leading-6">{question.explanation}</Txt>
        {question.explanationFigure ? <FigurePlaceholder figure={question.explanationFigure} /> : null}
      </View>
    </Rise>
  );
}
