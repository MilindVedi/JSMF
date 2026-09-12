"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { EXAMS } from "@/data/mock/exams";
import { SUBJECTS, getSubjectById } from "@/data/mock/subjects";
import { getNextUnansweredIndex, getSessionScope, getSessionSummary } from "@/lib/selectors";
import type { Question, TestSession } from "@/types";

function scopeDescription(session: TestSession, questions: Question[]) {
  const { examIds, subjectIds, questionCount } = getSessionScope(session, questions);

  const examNames = examIds.map((id) => EXAMS.find((e) => e.id === id)?.shortName ?? id);
  const subjectNames = subjectIds.map((id) => getSubjectById(id)?.name ?? id);

  // Name what's actually covered when it's a short list; fall back to a count
  // only when spelling it out would be noise.
  const exam =
    examIds.length >= EXAMS.length
      ? "All exams"
      : examNames.length <= 2
        ? examNames.join(" & ")
        : `${examIds.length} exams`;
  const subject =
    subjectIds.length >= SUBJECTS.length
      ? "All subjects"
      : subjectNames.length === 1
        ? subjectNames[0]
        : subjectNames.length === 2
          ? subjectNames.join(" & ")
          : "Mixed subjects";

  return `${exam} · ${subject} · ${questionCount} question${questionCount === 1 ? "" : "s"}`;
}

/**
 * The label shown on the "Continue where you left off" / "Last session"
 * line: the session's own type (`session.label`, e.g. "Question Bank" or
 * "Custom Test" — set once at creation by whichever screen started it, see
 * `useStartSession` call sites) followed by what it actually covers. This
 * always names the exact session type rather than ever guessing or mixing
 * one mode's presentation with another's.
 */
function scopeLabel(session: TestSession, questions: Question[]) {
  return `${session.label} · ${scopeDescription(session, questions)}`;
}

export function ContinuePracticeCard({
  inProgress,
  lastCompleted,
  questions,
}: {
  inProgress?: TestSession;
  lastCompleted?: TestSession;
  questions: Question[];
}) {
  if (inProgress) {
    const answered = Object.keys(inProgress.attempts).length;
    const total = inProgress.questionIds.length;
    const percent = total > 0 ? Math.round((answered / total) * 100) : 0;

    return (
      <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Continue where you left off
            </p>
            <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
              {answered}{" "}
              <span className="text-base font-medium text-muted-foreground">/ {total} completed</span>
            </p>
          </div>
          <Link
            href={`/practice/${inProgress.id}?i=${getNextUnansweredIndex(inProgress)}`}
            className={buttonVariants({ size: "lg", className: "w-fit shrink-0" })}
          >
            Resume
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <Progress value={percent} className="mt-4" aria-label="Session progress" />

        <p className="mt-3 text-sm text-muted-foreground">{scopeLabel(inProgress, questions)}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Start practising
        </p>
        <p className="mt-1 font-heading text-lg font-semibold text-foreground">
          No session in progress
        </p>
        {lastCompleted ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Last session: {scopeLabel(lastCompleted, questions)} ·{" "}
            {getSessionSummary(lastCompleted, questions).accuracy}% accuracy
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Start practising from the Question Bank or build a Custom Test.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/question-bank" className={buttonVariants({ size: "sm" })}>
          Question Bank
        </Link>
        <Link href="/custom-test/new" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Custom Test
        </Link>
      </div>
    </div>
  );
}
