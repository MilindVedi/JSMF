"use client";

import { Info } from "lucide-react";
import {
  examMockExamId,
  examStatuses,
  OPTION_LETTERS as LETTERS,
  type Attempt,
  type ExamSectionWindow,
  type ExamStatusCounts,
  type SessionQuestion,
  type TestSession,
} from "@jsmf/core/domain";
import type { SessionDetail } from "@jsmf/core/data-source";
import { DailyLimitNotice } from "@/components/pyq/query-states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { usePreferences, useTaxonomyLookup } from "@/hooks/pyq";
import { useAuthStore } from "@/store/auth-store";
import { QuestionCard } from "../question-card";
import { BookmarkButton } from "../bookmark-button";
import { ReportQuestionModal } from "../report-question-modal";
import { ExamHeader } from "./exam-header";
import { ExamActionBar } from "./exam-action-bar";
import { ExamInstructionsContent } from "./exam-instructions";
import { ExamMobileStatusBar } from "./exam-mobile-status-bar";
import { ExamSectionTabs } from "./exam-section-tabs";
import { ExamStatusPanel } from "./exam-status-panel";
import { ExamSubmitDialog } from "./exam-submit-dialog";
import { useVisitedQuestions } from "./use-visited-questions";

/** Where the question on screen sits among a mock's sections. */
export interface ExamSectionView {
  windows: ExamSectionWindow[];
  /** The section of the question on screen. */
  current: number;
  /** Time-bound sections: only the current one opens, the rest are locked. */
  locked: boolean;
}

/** The console's title: "NEET-PG Full Mock", "FMGE Mock Test", or "Mock Test". */
export function useExamTitle(session: TestSession): string {
  const profile = useAuthStore((s) => s.profile);
  const { data: preferences } = usePreferences();
  const lookup = useTaxonomyLookup();
  // A test drawn from one exam is that exam's mock; otherwise the student's own target exam.
  const examId = examMockExamId(session, preferences?.targetExamId ?? profile.targetExamId);
  const exam = examId ? lookup.exam(examId) : undefined;
  if (session.mode === "full-mock") return exam ? `${exam.shortName} Full Mock` : session.label;
  return exam ? `${exam.shortName} Mock Test` : "Mock Test";
}

/** The console's "Instructions" button: the same page the test opened with. */
export function ExamInstructionsDialog({ session }: { session: TestSession }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="hidden sm:inline-flex" />}>
        <Info />
        Instructions
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Instructions</DialogTitle>
        </DialogHeader>
        <ExamInstructionsContent session={session} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * A running test, laid out like the NEET-PG / FMGE / INI-CET computer-based
 * test console: question on the left, status legend and jump grid on the
 * right, sections along the top for a full mock. Presentation only —
 * answering, flagging, timing, section changes and submitting are the
 * practice runner's own handlers, passed in.
 */
export function ExamQuestionScreen({
  detail,
  question,
  index,
  total,
  isFirst,
  isLast,
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
  timerKey,
  timerLabel,
  onTimeUp,
  sectionView,
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
  /** Within the section, for a mock with time-bound sections. */
  isFirst: boolean;
  isLast: boolean;
  attempts: Record<string, Attempt>;
  flags: Record<string, boolean>;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  savedOptionId: string | null;
  hasUnsavedChoice: boolean;
  busy: boolean;
  submitting: boolean;
  timed: boolean;
  /** Seconds on the header clock: the paper's, or the running section's. */
  timeLeft: number;
  timerKey?: string | number;
  timerLabel?: string;
  onTimeUp: () => void;
  sectionView: ExamSectionView | null;
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
  const title = useExamTitle(session);

  const visited = useVisitedQuestions(session.id, question.id);
  const { statuses, counts } = examStatuses({ questionIds: session.questionIds, attempts, flags, visited });

  // A locked mock's palette and counts are the running section's, as on the real console.
  const openSection = sectionView?.locked ? sectionView.windows[sectionView.current] : null;
  const indices = openSection
    ? Array.from({ length: openSection.questions }, (_, i) => openSection.firstPosition + i)
    : undefined;
  const panelCounts = indices ? countOf(indices.map((i) => statuses[i])) : counts;
  const panelHeading = openSection ? openSection.name : "Questions";

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
        onTimeUp={onTimeUp}
        timerKey={timerKey}
        timerLabel={timerLabel}
        studentName={profile.name}
        avatarUrl={profile.avatarUrl}
        exitHref={session.sourceHref ?? "/dashboard"}
        instructionsSlot={<ExamInstructionsDialog session={session} />}
      />
      {sectionView && sectionView.windows.length > 1 && (
        <ExamSectionTabs
          sections={sectionView.windows}
          currentSection={sectionView.current}
          locked={sectionView.locked}
          onSelect={onJump}
        />
      )}
      <ExamMobileStatusBar
        counts={panelCounts}
        statuses={statuses}
        currentIndex={index}
        onJump={onJump}
        indices={indices}
        heading={panelHeading}
      />

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
            isFirst={isFirst}
            isLast={isLast}
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
          <ExamStatusPanel
            counts={panelCounts}
            statuses={statuses}
            currentIndex={index}
            onJump={onJump}
            indices={indices}
            heading={panelHeading}
          />
        </aside>
      </div>
    </div>
  );
}

function countOf(statuses: ReturnType<typeof examStatuses>["statuses"]): ExamStatusCounts {
  const counts: ExamStatusCounts = { answered: 0, "not-answered": 0, "not-visited": 0, marked: 0, "answered-marked": 0 };
  for (const status of statuses) counts[status] += 1;
  return counts;
}
