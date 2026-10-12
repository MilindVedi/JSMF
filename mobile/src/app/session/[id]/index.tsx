import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ArrowRight, Bookmark, CircleCheck, Flag, FlagTriangleRight, LayoutGrid, MessageSquareWarning, TriangleAlert } from "lucide-react-native";
import { remainingSeconds, type Attempt, type SessionQuestion } from "@jsmf/core/domain";
import { DailyLimitError, NotFoundError, type AnswerResult, type SessionDetail } from "@jsmf/core/data-source";
import { useAnswer, useBookmarkToggle, useSessionDetail, useSetFlag, useSubmitSession } from "@jsmf/core/hooks";
import { toast } from "@/lib/toast";
import { useColors } from "@/theme/theme";
import { Button, IconButton } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { DailyLimitNotice, EmptyState, Loading, ProgressBar, QueryError } from "@/components/ui/primitives";
import { cn, Txt } from "@/components/ui/text";
import { ExplanationPanel, QuestionCard } from "@/components/question/question-card";
import { ReportSheet } from "@/components/question/report-sheet";
import { ExamScreen } from "@/components/exam/exam-screen";
import { Timer } from "@/components/exam/timer";

/**
 * The practice runner (web's /practice/[sessionId]): one question per screen.
 * Practice shows the verdict and explanation straight after each answer; a
 * timed custom test is a real test (answers hidden until submit) and gets the
 * exam console instead. Answering, flagging and submitting are core's hooks.
 */
export default function SessionScreen() {
  const params = useLocalSearchParams<{ id: string; i?: string }>();
  const router = useRouter();
  const { data: detail, error, isPending, refetch } = useSessionDetail(params.id);
  const total = detail?.questions.length ?? 0;
  const raw = Number(params.i ?? 0);
  const index = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), Math.max(total - 1, 0)) : 0;
  const question = detail?.questions[index];

  if (isPending) return <Loading className="bg-background" />;
  if (error && !(error instanceof NotFoundError)) {
    return (
      <View className="flex-1 justify-center bg-background px-5">
        <QueryError error={error} onRetry={() => void refetch()} title="Couldn't load this session" />
      </View>
    );
  }
  if (!detail || !question) {
    return (
      <View className="flex-1 justify-center bg-background px-5">
        <EmptyState
          icon={TriangleAlert}
          title="This practice session doesn't exist"
          description="It may have expired, or the link is incorrect. Start a new session from the question bank or a custom test."
          action={<Button label="Go to Question Bank" onPress={() => router.replace("/practice")} />}
        />
      </View>
    );
  }
  // Remounts per question: resets the selection and the per-question timer (as web does with `key`).
  return <Runner key={question.id} detail={detail} question={question} index={index} total={total} />;
}

function Runner({ detail, question, index, total }: { detail: SessionDetail; question: SessionQuestion; index: number; total: number }) {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = detail;
  const answer = useAnswer(session.id);
  const setFlag = useSetFlag(session.id);
  const submitSession = useSubmitSession();
  const bookmarks = useBookmarkToggle();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const existingAttempt = session.attempts[question.id];
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [flagged, setFlagged] = useState(Boolean(session.flags[question.id]));
  const submitted = Boolean(existingAttempt || result);
  const isCorrect = result?.isCorrect ?? existingAttempt?.isCorrect ?? false;
  const revealed: SessionQuestion = result
    ? { ...question, correctOptionId: result.correctOptionId, explanation: result.explanation, explanationFigure: result.explanationFigure }
    : question;
  const isBookmarked = bookmarks.isBookmarked(question.id);
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const timed = Boolean(session.config.timed && session.config.durationSec && !detail.submitted);
  // A test keeps answers locked in but hides correctness until it is submitted.
  const hideResults = Boolean(session.config.testMode && !detail.submitted);
  const [timeLeft] = useState(() => remainingSeconds(session));
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(() => existingAttempt?.selectedOptionId ?? null);
  const startTime = useRef(0);
  useEffect(() => {
    // Mounted once per question (see the key above): the moment it was shown.
    startTime.current = Date.now();
  }, []);

  function goTo(next: number) {
    if (next < 0 || next >= total) return;
    router.setParams({ i: String(next) });
  }

  function exit() {
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }

  function saveAnswer(optionId: string, onSaved?: () => void) {
    answer.mutate(
      { questionId: question.id, optionId, timeSpentMs: Date.now() - startTime.current },
      {
        onSuccess: (saved) => {
          setResult(saved);
          onSaved?.();
        },
        onError: (error) => {
          if (error instanceof DailyLimitError) setLimitReached(true);
          else toast.error(error.message || "Could not save your answer. Please try again.");
        },
      }
    );
  }

  function handleSubmit() {
    if (!selectedOptionId || submitted || answer.isPending) return;
    saveAnswer(selectedOptionId);
  }

  function handleFinish() {
    const toResults = () => router.replace({ pathname: "/session/[id]/results", params: { id: session.id } });
    if (detail.submitted) return toResults();
    submitSession.mutate(session.id, {
      onSuccess: toResults,
      onError: (error) => toast.error(error.message || "Could not finish the session. Please try again."),
    });
  }

  function writeFlag(next: boolean) {
    setFlagged(next);
    setFlag.mutate({ questionId: question.id, flagged: next }, { onError: () => setFlagged(!next) });
  }

  // --- Test mode (exam console) -----------------------------------------------
  // A running test's answer can be changed (the API accepts a new option until
  // submit), so the saved option and the on-screen choice can differ.
  const savedOptionId = result?.selectedOptionId ?? existingAttempt?.selectedOptionId ?? null;
  const hasUnsavedChoice = Boolean(selectedOptionId && selectedOptionId !== savedOptionId);
  const examBusy = answer.isPending || submitSession.isPending;

  /** Saves the choice when it differs from what is saved, then runs `then`. */
  function saveChoice(then: () => void) {
    if (examBusy) return;
    if (!hasUnsavedChoice || !selectedOptionId || limitReached) then();
    else saveAnswer(selectedOptionId, then);
  }

  const advance = () => goTo(index + 1);

  function handleSaveAndNext() {
    // Saving an answer to a marked question makes it plain "Answered", as on the console.
    saveChoice(() => {
      if (selectedOptionId && flagged) writeFlag(false);
      advance();
    });
  }

  function handleMarkAndNext() {
    saveChoice(() => {
      if (!flagged) writeFlag(true);
      advance();
    });
  }

  /** There is no un-answer API: Clear Response drops an unsaved choice, back to the saved one. */
  function handleClearResponse() {
    setSelectedOptionId(savedOptionId);
  }

  const flags = { ...session.flags, [question.id]: flagged };
  const attempts: Record<string, Attempt> =
    result && !existingAttempt
      ? {
          ...session.attempts,
          [question.id]: { questionId: question.id, selectedOptionId: result.selectedOptionId, isCorrect: result.isCorrect, timeSpentSec: 0, answeredAt: new Date().toISOString() },
        }
      : session.attempts;

  if (hideResults) {
    return (
      <ExamScreen
        detail={detail}
        question={question}
        index={index}
        total={total}
        attempts={attempts}
        flags={flags}
        selectedOptionId={selectedOptionId}
        onSelect={setSelectedOptionId}
        savedOptionId={savedOptionId}
        hasUnsavedChoice={hasUnsavedChoice}
        busy={examBusy}
        submitting={submitSession.isPending}
        timed={timed}
        timeLeft={timeLeft}
        limitReached={limitReached}
        isBookmarked={isBookmarked}
        onToggleBookmark={() => bookmarks.toggle(question.id, isBookmarked)}
        onJump={goTo}
        onPrev={() => goTo(index - 1)}
        onSaveNext={handleSaveAndNext}
        onMarkNext={handleMarkAndNext}
        onClear={handleClearResponse}
        onSubmitTest={handleFinish}
        onExit={exit}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border bg-background px-3 pb-2.5" style={{ paddingTop: insets.top + 6 }}>
        <View className="flex-row items-center gap-1">
          <Pressable accessibilityRole="button" accessibilityLabel="Save and exit" onPress={exit} hitSlop={8} className="h-10 flex-row items-center gap-1.5 rounded-xl px-2 active:bg-muted">
            <ArrowLeft size={19} color={colors.foreground} />
          </Pressable>
          <View className="flex-1 items-center gap-1 px-2">
            <Txt weight={600} className="text-xs text-muted-foreground">
              Question {index + 1} of {total}
            </Txt>
            <ProgressBar value={((index + 1) / total) * 100} className="h-1.5 w-full" />
          </View>
          {timed && timeLeft ? <Timer durationSec={timeLeft} onTimeUp={handleFinish} /> : null}
          <IconButton icon={Flag} label={flagged ? "Unflag" : "Flag for review"} active={flagged} filled activeColor={colors["error-foreground"]} onPress={() => writeFlag(!flagged)} />
          <IconButton icon={Bookmark} label={isBookmarked ? "Remove bookmark" : "Bookmark question"} active={isBookmarked} filled activeColor={colors.primary} onPress={() => bookmarks.toggle(question.id, isBookmarked)} />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-5">
        <QuestionCard question={revealed} submitted={submitted} selectedOptionId={selectedOptionId} onSelect={(id) => !submitted && setSelectedOptionId(id)} />
        {submitted ? (
          <View className="mt-5">
            <ExplanationPanel question={revealed} status={isCorrect ? "correct" : "incorrect"} />
          </View>
        ) : null}
        {limitReached ? <DailyLimitNotice className="mt-5" /> : null}
      </ScrollView>

      <View className="flex-row items-center gap-2 border-t border-border bg-background px-3 pt-2.5" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
        <Button accessibilityLabel="Previous" variant="outline" icon={ArrowLeft} className="w-12 px-0" disabled={isFirst} onPress={() => goTo(index - 1)} />
        <Button accessibilityLabel="Question palette" variant="outline" icon={LayoutGrid} className="w-12 px-0" onPress={() => setPaletteOpen(true)} />
        <Button accessibilityLabel="Report this question" variant="outline" icon={MessageSquareWarning} className="w-12 px-0" onPress={() => setReportOpen(true)} />
        <View className="flex-1" />
        {!submitted ? (
          <Button label="Submit" icon={CircleCheck} disabled={!selectedOptionId || answer.isPending || limitReached} loading={answer.isPending} onPress={handleSubmit} />
        ) : isLast ? (
          <Button label="Finish test" icon={FlagTriangleRight} loading={submitSession.isPending} onPress={handleFinish} />
        ) : (
          <Button label="Next" iconRight={ArrowRight} onPress={() => goTo(index + 1)} />
        )}
      </View>

      <BottomSheet open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Questions" description="Tap one to jump to it.">
        <View className="mb-3 flex-row flex-wrap gap-x-4 gap-y-1.5">
          <LegendDot className="bg-success" label="Correct" />
          <LegendDot className="bg-error" label="Incorrect" />
          <LegendDot className="bg-muted" label="Unanswered" />
          <LegendDot className="bg-flag-foreground" label="Flagged" />
        </View>
        <View className="flex-row flex-wrap gap-2.5">
          {session.questionIds.map((id, i) => {
            const attempt = attempts[id];
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`Question ${i + 1}`}
                onPress={() => {
                  setPaletteOpen(false);
                  goTo(i);
                }}
                className={cn(
                  "size-11 items-center justify-center rounded-xl",
                  !attempt && "bg-muted",
                  attempt?.isCorrect && "bg-success",
                  attempt && !attempt.isCorrect && "bg-error",
                  i === index && "border-2 border-primary"
                )}
              >
                <Txt
                  font="mono"
                  weight={600}
                  className={cn("text-xs", !attempt ? "text-muted-foreground" : attempt.isCorrect ? "text-success-foreground" : "text-error-foreground")}
                >
                  {i + 1}
                </Txt>
                {flags[id] ? <View className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-flag-foreground" /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
      <ReportSheet questionId={question.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </View>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn("size-2.5 rounded-full", className)} />
      <Txt className="text-xs text-muted-foreground">{label}</Txt>
    </View>
  );
}
