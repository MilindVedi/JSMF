"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { remainingSeconds, type SessionQuestion } from "@jsmf/core/domain";
import { PracticeTopbar } from "@/components/practice/practice-topbar";
import { QuestionCard } from "@/components/practice/question-card";
import { ExplanationPanel } from "@/components/practice/explanation-panel";
import { PracticeActionBar } from "@/components/practice/practice-action-bar";
import { QuestionPalette } from "@/components/practice/question-palette";
import { ReportQuestionModal } from "@/components/practice/report-question-modal";
import { ExamQuestionScreen } from "@/components/practice/exam/exam-question-screen";
import { EmptyState } from "@/components/common/empty-state";
import { DailyLimitNotice, PageLoading, QueryError } from "@/components/pyq/query-states";
import { Button } from "@/components/ui/button";
import {
  useAnswer,
  useBookmarkToggle,
  useSessionDetail,
  useSetFlag,
  useSubmitSession,
} from "@/hooks/pyq";
import { DailyLimitError, NotFoundError, type AnswerResult, type SessionDetail } from "@jsmf/core/data-source";

export default function PracticeSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: detail, error, isPending, refetch } = useSessionDetail(sessionId);

  const total = detail?.questions.length ?? 0;
  const rawIndex = Number(searchParams.get("i") ?? 0);
  const index = Number.isFinite(rawIndex) ? Math.min(Math.max(rawIndex, 0), Math.max(total - 1, 0)) : 0;
  const question = detail?.questions[index];

  if (isPending) return <PageLoading className="min-h-dvh" />;

  if (error && !(error instanceof NotFoundError)) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <QueryError error={error} onRetry={() => refetch()} title="Couldn't load this session" />
      </div>
    );
  }

  if (!detail || !question) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <EmptyState
          icon={AlertTriangle}
          title="This practice session doesn't exist"
          description="It may have expired, or the link is incorrect. Start a new session from the question bank or a custom test."
          action={<Button onClick={() => router.push("/question-bank")}>Go to Question Bank</Button>}
        />
      </div>
    );
  }

  return (
    <PracticeQuestionRunner
      // Remounts this entire subtree on every question change, which is what
      // resets local answer-selection state and the per-question timer —
      // deliberately in place of a reset-effect, per React's guidance to
      // prefer a `key` over synchronizing state with an effect.
      key={question.id}
      detail={detail}
      question={question}
      index={index}
      total={total}
    />
  );
}

function PracticeQuestionRunner({
  detail,
  question,
  index,
  total,
}: {
  detail: SessionDetail;
  question: SessionQuestion;
  index: number;
  total: number;
}) {
  const router = useRouter();
  const { session } = detail;
  const answer = useAnswer(session.id);
  const setFlag = useSetFlag(session.id);
  const submitSession = useSubmitSession();
  const bookmarks = useBookmarkToggle();

  const existingAttempt = session.attempts[question.id];
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(Boolean(session.flags[question.id]));
  const submitted = Boolean(existingAttempt || result);
  const isCorrect = result?.isCorrect ?? existingAttempt?.isCorrect ?? false;
  const revealed: SessionQuestion = result
    ? {
        ...question,
        correctOptionId: result.correctOptionId,
        explanation: result.explanation,
        explanationFigure: result.explanationFigure,
      }
    : question;
  const isBookmarked = bookmarks.isBookmarked(question.id);
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const timed = Boolean(session.config.timed && session.config.durationSec && !detail.submitted);
  // A test keeps answers locked in but hides correctness until it is submitted.
  const hideResults = Boolean(session.config.testMode && !detail.submitted);
  const [timeLeft] = useState(() => remainingSeconds(detail.session));

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    () => existingAttempt?.selectedOptionId ?? null
  );
  const startTimeRef = useRef(0);
  useEffect(() => {
    // A fresh mount happens once per question (see the `key` above), so this
    // "on mount" timestamp is exactly the moment this question was shown.
    startTimeRef.current = Date.now();
  }, []);

  function goTo(newIndex: number) {
    if (newIndex < 0 || newIndex >= total) return;
    router.replace(`/practice/${session.id}?i=${newIndex}`);
  }

  function saveAnswer(optionId: string, onSaved?: () => void) {
    answer.mutate(
      { questionId: question.id, optionId, timeSpentMs: Date.now() - startTimeRef.current },
      {
        onSuccess: (saved) => {
          setResult(saved);
          onSaved?.();
        },
        onError: (error) => {
          if (error instanceof DailyLimitError) setLimitMessage(error.message);
          else toast.error(error.message || "Could not save your answer. Please try again.");
        },
      }
    );
  }

  function handleSubmit() {
    if (!selectedOptionId || submitted || answer.isPending) return;
    saveAnswer(selectedOptionId);
  }

  // Time-up or Submit while an answer is still saving waits for that save, so
  // the answer the student just gave is in the score.
  const finishAfterSave = useRef(false);
  useEffect(() => {
    if (!answer.isPending && finishAfterSave.current) {
      finishAfterSave.current = false;
      handleFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer.isPending]);

  function handleFinish() {
    if (answer.isPending) {
      finishAfterSave.current = true;
      return;
    }
    if (detail.submitted) {
      router.push(`/practice/${session.id}/results`);
      return;
    }
    submitSession.mutate(session.id, {
      onSuccess: () => router.push(`/practice/${session.id}/results`),
      onError: (error) => toast.error(error.message || "Could not finish the session. Please try again."),
    });
  }

  function writeFlag(next: boolean) {
    setFlagged(next);
    setFlag.mutate({ questionId: question.id, flagged: next }, { onError: () => setFlagged(!next) });
  }

  function toggleFlag() {
    writeFlag(!flagged);
  }

  // --- Test mode (exam console) -------------------------------------------------
  // A running test's answer can be changed (the API accepts a new option until
  // submit), so the saved option and the on-screen selection can differ.
  const savedOptionId = result?.selectedOptionId ?? existingAttempt?.selectedOptionId ?? null;
  const hasUnsavedChoice = Boolean(selectedOptionId && selectedOptionId !== savedOptionId);
  const examBusy = answer.isPending || submitSession.isPending;

  /** Saves the selection when it differs from what is saved, then runs `then`. */
  function saveChoice(then: () => void) {
    if (examBusy) return;
    if (!hasUnsavedChoice || !selectedOptionId || limitMessage) then();
    else saveAnswer(selectedOptionId, then);
  }

  const advance = () => goTo(index + 1);

  function handleSaveAndNext() {
    // Saving an answer to a marked question makes it plain "Answered", as on
    // the exam console; with nothing chosen the mark stays.
    saveChoice(() => {
      // Only once the answer is really saved: after the daily-limit error the
      // choice was not stored, so the mark stays.
      if (selectedOptionId && flagged && !limitMessage) writeFlag(false);
      advance();
    });
  }

  function handleMarkAndNext() {
    // Flag after the answer lands, so the session refetch the flag triggers
    // already includes it.
    saveChoice(() => {
      if (!flagged) writeFlag(true);
      advance();
    });
  }

  function handleClearResponse() {
    setSelectedOptionId(savedOptionId);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Keys belong to an open dialog or sheet (submit confirmation, the
      // question grid, report), never to the question behind it.
      if (e.defaultPrevented || (e.target as HTMLElement)?.closest?.('[role="dialog"],[role="alertdialog"]')) return;

      if (["1", "2", "3", "4"].includes(e.key) && (!submitted || hideResults)) {
        const optIndex = Number(e.key) - 1;
        if (question.options[optIndex]) setSelectedOptionId(question.options[optIndex].id);
      } else if (e.key === "Enter") {
        if (hideResults) {
          // Other buttons and links (dialogs, the grid) keep their own Enter;
          // a just-clicked option keeps focus, so it still means Save & Next.
          const target = e.target as HTMLElement;
          const ownEnter = tag === "A" || (tag === "BUTTON" && target.getAttribute("role") !== "radio");
          if (!ownEnter) {
            e.preventDefault();
            handleSaveAndNext();
          }
        } else if (!submitted) handleSubmit();
        else if (isLast) handleFinish();
        else goTo(index + 1);
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") {
        if (!isLast) goTo(index + 1);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "p") {
        if (!isFirst) goTo(index - 1);
      } else if (e.key.toLowerCase() === "b") {
        bookmarks.toggle(question.id, isBookmarked);
      } else if (e.key.toLowerCase() === "f") {
        toggleFlag();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, selectedOptionId, isFirst, isLast, index, flagged, isBookmarked, hideResults, examBusy, limitMessage]);

  const flags = { ...session.flags, [question.id]: flagged };
  const attempts =
    result && !existingAttempt
      ? {
          ...session.attempts,
          [question.id]: {
            questionId: question.id,
            selectedOptionId: result.selectedOptionId,
            isCorrect: result.isCorrect,
            timeSpentSec: 0,
            answeredAt: new Date().toISOString(),
          },
        }
      : session.attempts;

  if (hideResults) {
    return (
      <ExamQuestionScreen
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
        limitMessage={limitMessage}
        isBookmarked={isBookmarked}
        onToggleBookmark={() => bookmarks.toggle(question.id, isBookmarked)}
        onJump={goTo}
        onPrev={() => goTo(index - 1)}
        onSaveNext={handleSaveAndNext}
        onMarkNext={handleMarkAndNext}
        onClear={handleClearResponse}
        onSubmitTest={handleFinish}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PracticeTopbar
        current={index}
        total={total}
        timed={timed}
        durationSec={timeLeft}
        onTimeUp={handleFinish}
        isBookmarked={isBookmarked}
        onToggleBookmark={() => bookmarks.toggle(question.id, isBookmarked)}
        isFlagged={flagged}
        onToggleFlag={toggleFlag}
        exitHref={session.sourceHref ?? "/dashboard"}
      />

      <div className="mx-auto w-full max-w-[760px] flex-1 px-4 py-6 sm:py-8">
        <QuestionCard
          question={revealed}
          submitted={submitted && !hideResults}
          selectedOptionId={selectedOptionId}
          onSelect={(id) => !submitted && setSelectedOptionId(id)}
        />
        {submitted && hideResults && (
          <p className="mt-5 text-sm text-muted-foreground">
            Answer saved. Correct answers and explanations appear when you finish the test.
          </p>
        )}
        {submitted && !hideResults && (
          <div className="mt-5">
            <ExplanationPanel question={revealed} isCorrect={isCorrect} />
          </div>
        )}
        {limitMessage && (
          <div className="mt-5">
            <DailyLimitNotice message={limitMessage} />
          </div>
        )}
        <div className="h-6" />
      </div>

      <PracticeActionBar
        submitted={submitted}
        hasSelection={Boolean(selectedOptionId) && !answer.isPending && !limitMessage}
        isFirst={isFirst}
        isLast={isLast}
        onPrev={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
        onSubmit={handleSubmit}
        onFinish={handleFinish}
        paletteSlot={
          <QuestionPalette
            questionIds={session.questionIds}
            attempts={attempts}
            flags={flags}
            currentIndex={index}
            onJump={goTo}
            hideResults={hideResults}
          />
        }
        reportSlot={<ReportQuestionModal questionId={question.id} />}
      />
    </div>
  );
}
