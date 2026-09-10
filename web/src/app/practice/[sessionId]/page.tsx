"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { getQuestionById } from "@/data/mock/questions";
import type { Question, TestSession } from "@/types";
import { PracticeTopbar } from "@/components/practice/practice-topbar";
import { QuestionCard } from "@/components/practice/question-card";
import { ExplanationPanel } from "@/components/practice/explanation-panel";
import { PracticeActionBar } from "@/components/practice/practice-action-bar";
import { QuestionPalette } from "@/components/practice/question-palette";
import { ReportQuestionModal } from "@/components/practice/report-question-modal";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function PracticeSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const searchParams = useSearchParams();
  const router = useRouter();

  const session = usePracticeStore((s) => s.sessions[sessionId]);
  const hasHydrated = usePracticeStore((s) => s.hasHydrated);

  const total = session?.questionIds.length ?? 0;
  const rawIndex = Number(searchParams.get("i") ?? 0);
  const index = Number.isFinite(rawIndex) ? Math.min(Math.max(rawIndex, 0), Math.max(total - 1, 0)) : 0;
  const questionId = session?.questionIds[index];
  const question = questionId ? getQuestionById(questionId) : undefined;

  if (!hasHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session || !question) {
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
      sessionId={sessionId}
      session={session}
      question={question}
      index={index}
      total={total}
    />
  );
}

function PracticeQuestionRunner({
  sessionId,
  session,
  question,
  index,
  total,
}: {
  sessionId: string;
  session: TestSession;
  question: Question;
  index: number;
  total: number;
}) {
  const router = useRouter();
  const submitAnswer = usePracticeStore((s) => s.submitAnswer);
  const toggleFlag = usePracticeStore((s) => s.toggleFlag);
  const finishSession = usePracticeStore((s) => s.finishSession);
  const toggleBookmark = useBookmarksStore((s) => s.toggleBookmark);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);

  const existingAttempt = session.attempts[question.id];
  const submitted = Boolean(existingAttempt);
  const isBookmarked = bookmarks.some((b) => b.questionId === question.id);
  const isFirst = index === 0;
  const isLast = index === total - 1;

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
    router.replace(`/practice/${sessionId}?i=${newIndex}`);
  }

  function handleSubmit() {
    if (!selectedOptionId) return;
    const isCorrect = selectedOptionId === question.correctOptionId;
    const timeSpentSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
    submitAnswer(session.id, question.id, selectedOptionId, isCorrect, timeSpentSec);
  }

  function handleFinish() {
    finishSession(session.id);
    router.push(`/practice/${session.id}/results`);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (["1", "2", "3", "4"].includes(e.key) && !submitted) {
        const optIndex = Number(e.key) - 1;
        if (question.options[optIndex]) setSelectedOptionId(question.options[optIndex].id);
      } else if (e.key === "Enter") {
        if (!submitted) handleSubmit();
        else if (isLast) handleFinish();
        else goTo(index + 1);
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") {
        if (!isLast) goTo(index + 1);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "p") {
        if (!isFirst) goTo(index - 1);
      } else if (e.key.toLowerCase() === "b") {
        toggleBookmark(question.id);
      } else if (e.key.toLowerCase() === "f") {
        toggleFlag(session.id, question.id);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, selectedOptionId, isFirst, isLast, index]);

  return (
    <div className="flex min-h-dvh flex-col">
      <PracticeTopbar
        current={index}
        total={total}
        timed={session.config.timed}
        durationSec={session.config.durationSec}
        onTimeUp={handleFinish}
        isBookmarked={isBookmarked}
        onToggleBookmark={() => toggleBookmark(question.id)}
        isFlagged={Boolean(session.flags[question.id])}
        onToggleFlag={() => toggleFlag(session.id, question.id)}
        exitHref="/dashboard"
      />

      <div className="mx-auto w-full max-w-[760px] flex-1 px-4 py-6 sm:py-8">
        <QuestionCard
          question={question}
          submitted={submitted}
          selectedOptionId={selectedOptionId}
          onSelect={(id) => !submitted && setSelectedOptionId(id)}
        />
        {submitted && existingAttempt && (
          <div className="mt-5">
            <ExplanationPanel question={question} isCorrect={existingAttempt.isCorrect} />
          </div>
        )}
        <div className="h-6" />
      </div>

      <PracticeActionBar
        submitted={submitted}
        hasSelection={Boolean(selectedOptionId)}
        isFirst={isFirst}
        isLast={isLast}
        onPrev={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
        onSubmit={handleSubmit}
        onFinish={handleFinish}
        paletteSlot={
          <QuestionPalette
            questionIds={session.questionIds}
            attempts={session.attempts}
            flags={session.flags}
            currentIndex={index}
            onJump={goTo}
          />
        }
        reportSlot={<ReportQuestionModal questionId={question.id} />}
      />
    </div>
  );
}
