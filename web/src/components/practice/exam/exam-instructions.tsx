"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  EXAM_STATUS_LABEL,
  formatMinutes,
  markingLabel,
  patternTotals,
  type ExamQuestionStatus,
  type TestSession,
} from "@jsmf/core/domain";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExamStatusCell } from "./exam-status-panel";

const STATUS_MEANING: Record<ExamQuestionStatus, string> = {
  "not-visited": "You have not opened the question yet.",
  "not-answered": "You opened the question but have not saved an answer.",
  answered: "Your answer is saved.",
  marked: "Marked to look at again, with no answer saved.",
  "answered-marked": "Answer saved and marked to look at again. It will be evaluated.",
};

/** The real console lists them in this order on its instructions page. */
const LEGEND_ORDER: ExamQuestionStatus[] = ["not-visited", "not-answered", "answered", "marked", "answered-marked"];

/**
 * What the computer-based test tells a candidate before it starts, adapted
 * to this test: its length, its sections and their locking, its marking,
 * the palette's colours and the buttons. Shown full-page before the clock
 * starts, and again from the console's "Instructions" button.
 */
export function ExamInstructionsContent({ session }: { session: TestSession }) {
  const pattern = session.pattern;
  const totalQuestions = session.totalQuestions ?? session.questionIds.length;
  const totalMinutes = pattern ? patternTotals(pattern).minutes : Math.round((session.config.durationSec ?? 0) / 60);
  const locked = Boolean(pattern?.sectionsLocked);

  return (
    <div className="space-y-7 text-sm leading-relaxed text-foreground">
      <section className="space-y-2.5">
        <h3 className="font-display text-base font-semibold">General instructions</h3>
        <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">
          <li>
            This paper has <strong>{totalQuestions} questions</strong>
            {totalMinutes > 0 && (
              <>
                {" "}
                and lasts <strong>{formatMinutes(totalMinutes)}</strong>
              </>
            )}
            . Every question has one correct answer.
          </li>
          <li>
            The clock at the top right of the screen shows the time left. When it reaches zero, the test
            submits itself — you do not need to press Submit.
          </li>
          {pattern && pattern.sections.length > 1 && locked && (
            <li>
              The paper is in <strong>{pattern.sections.length} sections</strong>, each with its own time. When a
              section&apos;s time ends, the next section opens on its own. You <strong>cannot go back</strong> to an
              earlier section, and you cannot move on to the next one early.
            </li>
          )}
          {pattern && pattern.sections.length > 1 && !locked && (
            <li>The paper is in {pattern.sections.length} sections. You can move between all of them at any time.</li>
          )}
          <li>
            {pattern ? (
              pattern.marking.incorrect.num === 0 ? (
                <>
                  Marking: <strong>{markingLabel(pattern)}</strong>. Unanswered questions get no marks.
                </>
              ) : (
                <>
                  Marking: <strong>{markingLabel(pattern)}</strong> — marks for a right answer, and marks taken off
                  for a wrong one. Unanswered questions get no marks.
                </>
              )
            ) : (
              <>Correct answers and explanations are shown only after you submit.</>
            )}
          </li>
        </ol>
      </section>

      {pattern && pattern.sections.length > 1 && (
        <section className="space-y-2.5">
          <h3 className="font-display text-base font-semibold">Sections</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 text-right font-medium">Questions</th>
                  <th className="px-3 py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pattern.sections.map((section) => (
                  <tr key={section.name}>
                    <td className="px-3 py-2">{section.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{section.questions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMinutes(section.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <h3 className="font-display text-base font-semibold">The question palette</h3>
        <p className="text-muted-foreground">
          The panel on the right shows every question&apos;s number in one of these states:
        </p>
        <ul className="space-y-2">
          {LEGEND_ORDER.map((status) => (
            <li key={status} className="flex items-center gap-3">
              <ExamStatusCell status={status} className="size-8" />
              <span>
                <strong className="font-medium">{EXAM_STATUS_LABEL[status]}</strong>
                <span className="text-muted-foreground"> — {STATUS_MEANING[status]}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2.5">
        <h3 className="font-display text-base font-semibold">Answering</h3>
        <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">
          <li>Click an option to choose it. Click another option to change your choice.</li>
          <li>
            <strong>Save &amp; Next</strong> saves your answer and opens the next question.
          </li>
          <li>
            <strong>Mark for Review &amp; Next</strong> saves your answer, if you chose one, marks the question to
            look at again, and opens the next question.
          </li>
          <li>
            <strong>Clear Response</strong> removes a choice you have not saved yet.
          </li>
          <li>
            Moving to another question without <strong>Save &amp; Next</strong> does <strong>not</strong> save the
            choice on screen. Click a number in the palette to go straight to that question.
          </li>
          <li>A saved answer can be changed until the test is submitted.</li>
        </ol>
      </section>
    </div>
  );
}

/** Full page before the clock starts: the instructions, the declaration, and "I am ready to begin". */
export function ExamInstructionsScreen({
  session,
  header,
  beginning,
  onBegin,
}: {
  session: TestSession;
  header: React.ReactNode;
  beginning: boolean;
  onBegin: () => void;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {header}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <h2 className="font-display text-xl font-semibold text-foreground">Instructions</h2>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Please read these carefully. The clock starts only when you begin.
        </p>
        <ExamInstructionsContent session={session} />
      </main>
      <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/85 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-1 items-start gap-2.5 text-sm text-foreground">
            <Checkbox
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
              aria-label="I have read and understood the instructions"
            />
            <span>I have read and understood the instructions, and I am ready to take this test.</span>
          </label>
          <Button size="lg" onClick={onBegin} disabled={!agreed || beginning}>
            {beginning && <Loader2 className="animate-spin" />}
            I am ready to begin
          </Button>
        </div>
      </div>
    </div>
  );
}
