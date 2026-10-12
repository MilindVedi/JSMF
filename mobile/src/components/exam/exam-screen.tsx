import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ArrowRight, Bookmark, Check, Eraser, LayoutGrid, MessageSquareWarning } from "lucide-react-native";
import {
  EXAM_STATUS_LABEL,
  EXAM_STATUS_ORDER,
  EXAM_WARN_AT_SEC,
  OPTION_LETTERS,
  examMockExamId,
  examStatuses,
  initialsOf,
  type Attempt,
  type ExamQuestionStatus,
  type ExamStatusCounts,
  type SessionQuestion,
} from "@jsmf/core/domain";
import type { SessionDetail } from "@jsmf/core/data-source";
import { usePreferences, useTaxonomyLookup } from "@jsmf/core/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { useVisitedQuestions } from "@/lib/visited";
import { useColors } from "@/theme/theme";
import { Button, IconButton } from "@/components/ui/button";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { DailyLimitNotice } from "@/components/ui/primitives";
import { cn, Txt } from "@/components/ui/text";
import { QuestionCard } from "@/components/question/question-card";
import { ReportSheet } from "@/components/question/report-sheet";
import { Timer } from "./timer";

/**
 * A running test laid out like the NEET-PG / FMGE / INI-CET computer-based
 * test console (web's ExamQuestionScreen), reshaped for a phone: the status
 * counts sit under the header, the legend and jump grid open in a bottom
 * sheet, and the console's buttons sit in a two-row bar at the bottom.
 * Presentation only — answering, flagging, timing and submitting are the
 * runner's handlers.
 */

/** Squares for plain states, circles for anything marked for review (shared by legend and grid). */
export function ExamStatusCell({ status, children, size = 28, current = false }: { status: ExamQuestionStatus; children?: ReactNode; size?: number; current?: boolean }) {
  const colors = useColors();
  const marked = status === "marked" || status === "answered-marked";
  const bg =
    status === "answered" ? colors.success : status === "not-answered" ? colors.error : status === "not-visited" ? colors.card : colors.primary;
  const fg =
    status === "answered"
      ? colors["success-foreground"]
      : status === "not-answered"
        ? colors["error-foreground"]
        : status === "not-visited"
          ? colors["muted-foreground"]
          : colors["primary-foreground"];
  const border = status === "not-visited" ? colors.border : marked ? "transparent" : `${fg}40`;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: marked ? size : 6,
        backgroundColor: bg,
        borderWidth: current ? 2 : 1,
        borderColor: current ? colors.foreground : border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Txt font="mono" weight={600} style={{ color: fg, fontSize: size < 24 ? 10 : 12 }}>
          {children}
        </Txt>
      ) : (
        children
      )}
      {status === "answered-marked" ? (
        <View
          style={{ position: "absolute", right: -3, bottom: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors["success-foreground"], borderWidth: 2, borderColor: colors.card }}
          className="items-center justify-center"
        >
          <Check size={8} strokeWidth={4} color={colors.background} />
        </View>
      ) : null}
    </View>
  );
}

function StatusLegend({ counts }: { counts: ExamStatusCounts }) {
  return (
    <View className="gap-2.5">
      {EXAM_STATUS_ORDER.map((status) => (
        <View key={status} className="flex-row items-center gap-3">
          <ExamStatusCell status={status}>{counts[status]}</ExamStatusCell>
          <Txt className="flex-1 text-sm">{EXAM_STATUS_LABEL[status]}</Txt>
        </View>
      ))}
      <Txt className="text-xs leading-4 text-muted-foreground">Answered &amp; Marked for Review questions are evaluated as answered.</Txt>
    </View>
  );
}

export interface ExamScreenProps {
  detail: SessionDetail;
  question: SessionQuestion;
  index: number;
  total: number;
  attempts: Record<string, Attempt>;
  flags: Record<string, boolean>;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  savedOptionId: string | null;
  hasUnsavedChoice: boolean;
  busy: boolean;
  submitting: boolean;
  timed: boolean;
  timeLeft: number;
  limitReached: boolean;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onJump: (index: number) => void;
  onPrev: () => void;
  onSaveNext: () => void;
  onMarkNext: () => void;
  onClear: () => void;
  onSubmitTest: () => void;
  onExit: () => void;
}

export function ExamScreen(props: ExamScreenProps) {
  const { detail, question, index, total, attempts, flags, selectedOptionId, onSelect, savedOptionId, hasUnsavedChoice, busy, submitting, timed, timeLeft } = props;
  const { session } = detail;
  const user = useAuthStore((s) => s.user);
  const { data: preferences } = usePreferences();
  const lookup = useTaxonomyLookup();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [gridOpen, setGridOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const examId = examMockExamId(session, preferences?.targetExamId);
  const exam = examId ? lookup.exam(examId) : undefined;
  const title = exam ? `${exam.shortName} Mock Test` : "Mock Test";
  const studentName = user?.name || "Student";
  const visited = useVisitedQuestions(session.id, question.id);
  const { statuses, counts } = examStatuses({ questionIds: session.questionIds, attempts, flags, visited });
  const savedIndex = savedOptionId ? question.options.findIndex((o) => o.id === savedOptionId) : -1;
  const savedLetter = savedIndex >= 0 ? OPTION_LETTERS[savedIndex] : null;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const left = counts["not-answered"] + counts["not-visited"] + counts.marked;

  return (
    <View className="flex-1 bg-background">
      {/* Header: exam title, candidate, time left */}
      <View className="border-b border-border bg-card px-3 pb-2.5" style={{ paddingTop: insets.top + 6 }}>
        <View className="flex-row items-center gap-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Save and exit — saved answers are kept" onPress={props.onExit} hitSlop={8} className="size-10 items-center justify-center rounded-xl active:bg-muted">
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <View className="flex-1">
            <Txt font="display" weight={600} className="text-base" numberOfLines={1} accessibilityRole="header">
              {title}
            </Txt>
            <View className="mt-0.5 flex-row items-center gap-1.5">
              <View className="size-5 items-center justify-center rounded-full bg-secondary">
                <Txt weight={700} className="text-[9px] text-secondary-foreground">
                  {initialsOf(studentName)}
                </Txt>
              </View>
              <Txt className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
                {studentName}
              </Txt>
            </View>
          </View>
          {timed && timeLeft ? (
            <View className="items-end gap-0.5">
              <Txt weight={500} className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Time Left
              </Txt>
              <Timer durationSec={timeLeft} onTimeUp={props.onSubmitTest} warnAtSec={EXAM_WARN_AT_SEC} withHours />
            </View>
          ) : null}
        </View>
      </View>

      {/* Status counts + the full grid */}
      <View className="h-12 flex-row items-center gap-2.5 border-b border-border bg-background px-4">
        <View className="flex-1 flex-row items-center gap-2" accessibilityLabel="Question status counts">
          {EXAM_STATUS_ORDER.map((status) => (
            <View key={status} accessibilityLabel={`${EXAM_STATUS_LABEL[status]}: ${counts[status]}`}>
              <ExamStatusCell status={status} size={26}>
                {counts[status]}
              </ExamStatusCell>
            </View>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setGridOpen(true)} className="h-9 flex-row items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 active:bg-muted">
          <LayoutGrid size={15} color={colors.foreground} />
          <Txt weight={600} className="text-xs">
            All questions
          </Txt>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-4">
        <View className="mb-4 flex-row items-center gap-2 border-b border-border pb-3">
          <Txt font="display" weight={600} className="text-xl">
            Question {index + 1}
          </Txt>
          <Txt className="text-sm text-muted-foreground">of {total}</Txt>
          <View className="ml-auto flex-row items-center">
            <IconButton icon={Bookmark} label={props.isBookmarked ? "Remove bookmark" : "Bookmark question"} active={props.isBookmarked} filled activeColor={colors.primary} onPress={props.onToggleBookmark} />
            <IconButton icon={MessageSquareWarning} label="Report this question" onPress={() => setReportOpen(true)} />
          </View>
        </View>
        <QuestionCard question={question} submitted={false} selectedOptionId={selectedOptionId} onSelect={onSelect} hideMeta />
        {savedLetter ? (
          <Txt className="mt-4 text-xs text-muted-foreground">
            {hasUnsavedChoice
              ? `Saved answer: ${savedLetter}. Save & Next to replace it with your new choice.`
              : `Saved answer: ${savedLetter}. Choose another option and save to change it.`}
          </Txt>
        ) : null}
        {props.limitReached ? <DailyLimitNotice className="mt-5" /> : null}
      </ScrollView>

      {/* The console's buttons */}
      <View className="gap-2 border-t border-border bg-background px-3 pt-2.5" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
        <View className="flex-row gap-2">
          <Button
            label={isLast ? "Mark for Review" : "Mark & Next"}
            accessibilityLabel={isLast ? "Mark for Review" : "Mark for Review & Next"}
            variant="outline"
            icon={Bookmark}
            className="flex-1"
            disabled={busy}
            onPress={props.onMarkNext}
          />
          <Button
            label="Clear Response"
            variant="outline"
            icon={Eraser}
            className="flex-1"
            // There is no un-answer API: Clear only drops a choice not yet saved.
            disabled={!hasUnsavedChoice || busy}
            onPress={props.onClear}
          />
        </View>
        {!hasUnsavedChoice && savedOptionId ? (
          <Txt className="text-center text-[11px] text-muted-foreground">Saved answers can be changed by choosing another option.</Txt>
        ) : null}
        <View className="flex-row gap-2">
          <Button accessibilityLabel="Previous" variant="outline" icon={ArrowLeft} className="w-12 px-0" disabled={isFirst || busy} onPress={props.onPrev} />
          <Button label={isLast ? "Save" : "Save & Next"} iconRight={isLast ? undefined : ArrowRight} className="flex-1" disabled={busy} onPress={props.onSaveNext} />
          <Button label="Submit" variant="outline" disabled={submitting} onPress={() => setSubmitOpen(true)} />
        </View>
      </View>

      <BottomSheet open={gridOpen} onClose={() => setGridOpen(false)} title="Question status" description="Tap a question to open it.">
        <StatusLegend counts={counts} />
        <Txt weight={600} className="mb-3 mt-5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Questions
        </Txt>
        <View className="flex-row flex-wrap gap-3">
          {statuses.map((status, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Question ${i + 1}, ${EXAM_STATUS_LABEL[status]}`}
              accessibilityState={{ selected: i === index }}
              onPress={() => {
                setGridOpen(false);
                props.onJump(i);
              }}
            >
              <ExamStatusCell status={status} size={44} current={i === index}>
                {i + 1}
              </ExamStatusCell>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <Dialog
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit test?"
        description={
          left > 0
            ? `${left} of ${total} questions have no answer saved. Once submitted, answers can't be changed.`
            : "Every question has an answer saved. Once submitted, answers can't be changed."
        }
        footer={
          <>
            <Button label="Back to test" variant="outline" disabled={submitting} onPress={() => setSubmitOpen(false)} />
            <Button label="Submit Test" loading={submitting} onPress={props.onSubmitTest} />
          </>
        }
      >
        <View className="overflow-hidden rounded-xl border border-border">
          {EXAM_STATUS_ORDER.map((status, i) => (
            <View key={status} className={cn("flex-row items-center gap-3 px-3 py-2.5", i > 0 && "border-t border-border")}>
              <ExamStatusCell status={status} size={20} />
              <Txt className="flex-1 text-sm">{EXAM_STATUS_LABEL[status]}</Txt>
              <Txt font="mono" weight={600} className="text-sm">
                {counts[status]}
              </Txt>
            </View>
          ))}
        </View>
      </Dialog>

      <ReportSheet questionId={question.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </View>
  );
}
