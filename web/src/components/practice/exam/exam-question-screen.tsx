"use client";

import { examMockExamId, examStatuses, OPTION_LETTERS as LETTERS, type Attempt, type SessionQuestion } from "@jsmf/core/domain";
import type { SessionDetail } from "@jsmf/core/data-source";
import { DailyLimitNotice } from "@/components/pyq/query-states";
import { usePreferences, useTaxonomyLookup } from "@/hooks/pyq";
import { useAuthStore } from "@/store/auth-store";
import { QuestionCard } from "../question-card";
import { BookmarkButton } from "../bookmark-button";
import { ReportQuestionModal } from "../report-question-modal";
import { ExamHeader } from "./exam-header";
import { ExamActionBar } from "./exam-action-bar";
import { ExamMobileStatusBar } from "./exam-mobile-status-bar";
import { ExamStatusPanel } from "./exam-status-panel";
import { ExamSubmitDialog } from "./exam-submit-dialog";
import { useVisitedQuestions } from "./use-visited-questions";


/**
 * A running test, laid out like the NEET-PG / FMGE / INI-CET computer-based
 * test console: question on the left, status legend and jump grid on the
 * right. Presentation only — answering, flagging, timing and submitting are
 * the practice runner's own handlers, passed in.
 */
export function ExamQuestionScreen({
  detail,
  question,
  index,
  total,
  attempts,
  flags,
  selectedOptionId,
  onSelect,
  savedOptionId,
  hasUnsavedChoice,
  busy,
  submitting,
  timed,
  timeLeft,
  limitMessage,
  isBookmarked,
  onToggleBookmark,
  onJump,
  onPrev,
  onSaveNext,
  onMarkNext,
  onClear,
  onSubmitTest,
}: {
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
  limitMessage: string | null;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onJump: (index: number) => void;
  onPrev: () => void;
  onSaveNext: () => void;
  onMarkNext: () => void;
  onClear: () => void;
  onSubmitTest: () => void;
}) {
  const { session } = detail;
  const profile = useAuthStore((s) => s.profile);
  const { data: preferences } = usePreferences();
  const lookup = useTaxonomyLookup();

  // A test drawn from one exam is that exam's mock; otherwise the student's own target exam.
  const examId = examMockExamId(session, preferences?.targetExamId ?? profile.targetExamId);
  const exam = examId ? lookup.exam(examId) : undefined;
  const title = exam ? `${exam.shortName} Mock Test` : "Mock Test";

  const visited = useVisitedQuestions(session.id, question.id);
  const { statuses, counts } = examStatuses({ questionIds: session.questionIds, attempts, flags, visited });

  const savedIndex = savedOptionId ? question.options.findIndex((o) => o.id === savedOptionId) : -1;
  const savedLetter = savedIndex >= 0 ? LETTERS[savedIndex] : null;

  const submitDialog = (
    <ExamSubmitDialog counts={counts} total={total} submitting={submitting} onConfirm={onSubmitTest} />
  );

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ExamHeader
        title={title}
        timed={timed}
        durationSec={timeLeft}
        onTimeUp={onSubmitTest}
        studentName={profile.name}
        avatarUrl={profile.avatarUrl}
        exitHref={session.sourceHref ?? "/dashboard"}
      />
      <ExamMobileStatusBar counts={counts} statuses={statuses} currentIndex={index} onJump={onJump} />

      <div className="flex flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-[860px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
            <div className="mb-5 flex items-center gap-3 border-b border-border pb-3">
              <h2 className="font-display text-xl font-semibold text-foreground">Question {index + 1}</h2>
              <span className="text-sm text-muted-foreground tabular-nums">of {total}</span>
              <div className="ml-auto flex items-center gap-1">
                <BookmarkButton isBookmarked={isBookmarked} onToggle={onToggleBookmark} />
                <ReportQuestionModal questionId={question.id} />
              </div>
            </div>

            <QuestionCard
              question={question}
              submitted={false}
              selectedOptionId={selectedOptionId}
              onSelect={onSelect}
              hideMeta
            />

            {savedLetter && (
              <p className="mt-4 text-xs text-muted-foreground">
                {hasUnsavedChoice
                  ? `Saved answer: ${savedLetter}. Save & Next to replace it with your new choice.`
                  : `Saved answer: ${savedLetter}. Choose another option and save to change it.`}
              </p>
            )}
            {limitMessage && (
              <div className="mt-5">
                <DailyLimitNotice message={limitMessage} />
              </div>
            )}
          </div>

          <ExamActionBar
            isFirst={index === 0}
            isLast={index === total - 1}
            busy={busy}
            canClear={hasUnsavedChoice}
            clearHint={savedOptionId ? "Saved answers can be changed by choosing another option" : undefined}
            onPrev={onPrev}
            onSaveNext={onSaveNext}
            onMarkNext={onMarkNext}
            onClear={onClear}
            submitSlot={submitDialog}
          />
        </main>

        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[300px] shrink-0 border-l border-border bg-card lg:block">
          <ExamStatusPanel counts={counts} statuses={statuses} currentIndex={index} onJump={onJump} />
        </aside>
      </div>
    </div>
  );
}
