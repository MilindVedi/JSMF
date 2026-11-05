import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check } from "lucide-react-native";
import {
  EXAM_STATUS_LABEL,
  formatMinutes,
  markingLabel,
  patternTotals,
  type ExamQuestionStatus,
  type TestSession,
} from "@jsmf/core/domain";
import type { SessionDetail } from "@jsmf/core/data-source";
import { useBeginSession } from "@jsmf/core/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { useColors } from "@/theme/theme";
import { Button } from "@/components/ui/button";
import { cn, Txt } from "@/components/ui/text";
import { CandidateRow, ExamStatusCell } from "./exam-screen";

const LEGEND: { status: ExamQuestionStatus; meaning: string }[] = [
  { status: "not-visited", meaning: "You have not opened the question yet." },
  { status: "not-answered", meaning: "You opened it but have not saved an answer." },
  { status: "answered", meaning: "Your answer is saved." },
  { status: "marked", meaning: "Marked to look at again, with no answer saved." },
  { status: "answered-marked", meaning: "Answer saved and marked. It will be evaluated." },
];

function Point({ n, children }: { n: number; children: string }) {
  return (
    <View className="flex-row gap-2">
      <Txt className="w-5 text-sm text-muted-foreground">{n}.</Txt>
      <Txt className="flex-1 text-sm leading-5">{children}</Txt>
    </View>
  );
}

/** What the test tells a candidate before it starts (web's ExamInstructionsContent). */
export function ExamInstructionsContent({ session }: { session: TestSession }) {
  const pattern = session.pattern;
  const total = session.totalQuestions ?? session.questionIds.length;
  const minutes = pattern ? patternTotals(pattern).minutes : Math.round((session.config.durationSec ?? 0) / 60);
  const sections = pattern?.sections ?? [];
  const general = [
    `This paper has ${total} questions${minutes ? ` and lasts ${formatMinutes(minutes)}` : ""}. Every question has one correct answer.`,
    "The clock at the top shows the time left. When it reaches zero, the test submits itself.",
    ...(sections.length > 1 && pattern?.sectionsLocked
      ? [`The paper is in ${sections.length} sections, each with its own time. When a section's time ends, the next opens on its own. You cannot go back to an earlier section, or move on early.`]
      : sections.length > 1
        ? [`The paper is in ${sections.length} sections. You can move between all of them at any time.`]
        : []),
    !pattern
      ? "Correct answers and explanations are shown only after you submit."
      : pattern.marking.incorrect.num === 0
        ? `Marking: ${markingLabel(pattern)}. Unanswered questions get no marks.`
        : `Marking: ${markingLabel(pattern)} — marks for a right answer, and marks taken off for a wrong one. Unanswered questions get no marks.`,
  ];
  const answering = [
    "Tap an option to choose it; tap another to change your choice.",
    "Save & Next saves your answer and opens the next question.",
    "Mark & Next saves your answer, if any, marks the question to look at again, and moves on.",
    "Clear Response removes a choice you have not saved yet.",
    "Moving to another question without Save & Next does not save the choice on screen. Tap a number in the palette to go straight to that question.",
    "A saved answer can be changed until the test is submitted.",
  ];

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Txt font="display" weight={600} className="text-base">
          General instructions
        </Txt>
        {general.map((text, i) => (
          <Point key={i} n={i + 1}>
            {text}
          </Point>
        ))}
      </View>
      {sections.length > 1 ? (
        <View className="gap-2">
          <Txt font="display" weight={600} className="text-base">
            Sections
          </Txt>
          <View className="overflow-hidden rounded-xl border border-border">
            {sections.map((s, i) => (
              <View key={s.name} className={cn("flex-row px-3 py-2.5", i > 0 && "border-t border-border")}>
                <Txt className="flex-1 text-sm">{s.name}</Txt>
                <Txt className="w-24 text-right text-sm text-muted-foreground">{s.questions} q</Txt>
                <Txt className="w-24 text-right text-sm text-muted-foreground">{formatMinutes(s.minutes)}</Txt>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View className="gap-2.5">
        <Txt font="display" weight={600} className="text-base">
          The question palette
        </Txt>
        {LEGEND.map(({ status, meaning }) => (
          <View key={status} className="flex-row items-center gap-3">
            <ExamStatusCell status={status} size={28} />
            <Txt className="flex-1 text-sm leading-5">
              <Txt weight={600} className="text-sm">
                {EXAM_STATUS_LABEL[status]}
              </Txt>
              <Txt className="text-sm text-muted-foreground"> — {meaning}</Txt>
            </Txt>
          </View>
        ))}
      </View>
      <View className="gap-2">
        <Txt font="display" weight={600} className="text-base">
          Answering
        </Txt>
        {answering.map((text, i) => (
          <Point key={i} n={i + 1}>
            {text}
          </Point>
        ))}
      </View>
    </View>
  );
}

/** Before the clock starts: instructions, the declaration, "I am ready to begin". */
export function ExamBeginScreen({ detail, title, onExit }: { detail: SessionDetail; title: string; onExit: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const begin = useBeginSession(detail.session.id);
  const [agreed, setAgreed] = useState(false);
  const studentName = useAuthStore((s) => s.user)?.name || "Student";

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 border-b border-border bg-card px-3 pb-2.5" style={{ paddingTop: insets.top + 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onExit} hitSlop={8} className="size-10 items-center justify-center rounded-xl active:bg-muted">
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <View className="flex-1">
          <Txt font="display" weight={600} className="text-base" numberOfLines={1} accessibilityRole="header">
            {title}
          </Txt>
          <CandidateRow name={studentName} />
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-5">
        <Txt font="display" weight={600} className="text-xl">
          Instructions
        </Txt>
        <Txt className="mb-5 mt-1 text-sm text-muted-foreground">Please read these carefully. The clock starts only when you begin.</Txt>
        <ExamInstructionsContent session={detail.session} />
      </ScrollView>
      <View className="gap-3 border-t border-border bg-background px-5 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          onPress={() => setAgreed((v) => !v)}
          className="flex-row items-start gap-3"
        >
          <View className={cn("mt-0.5 size-5 items-center justify-center rounded border", agreed ? "border-primary bg-primary" : "border-border")}>
            {agreed ? <Check size={14} strokeWidth={3} color={colors["primary-foreground"]} /> : null}
          </View>
          <Txt className="flex-1 text-sm leading-5">I have read and understood the instructions, and I am ready to take this test.</Txt>
        </Pressable>
        <Button label="I am ready to begin" size="lg" disabled={!agreed || begin.isPending} loading={begin.isPending} onPress={() => begin.mutate()} />
      </View>
    </View>
  );
}
