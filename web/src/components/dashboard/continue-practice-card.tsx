"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { EXAMS } from "@/data/mock/exams";
import { SUBJECTS, getSubjectById } from "@/data/mock/subjects";
import { getSessionScope, getSessionSummary } from "@/lib/selectors";
import type { Question, TestSession } from "@/types";

function scopeLabel(session: TestSession, questions: Question[]) {
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
      : subjectNames.length <= 2
        ? subjectNames.join(" & ")
        : `${subjectIds.length} subjects`;

  return `${exam} · ${subject} · ${questionCount} question${questionCount === 1 ? "" : "s"}`;
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
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Continue where you left off
            </p>
            <p className="mt-1 font-heading text-lg font-semibold text-foreground">
              {scopeLabel(inProgress, questions)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {answered} / {total} completed
            </p>
          </div>
          <Link
            href={`/practice/${inProgress.id}?i=${answered < total ? answered : 0}`}
            className={buttonVariants({ size: "lg", className: "w-fit shrink-0" })}
          >
            Continue
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <Progress value={percent} className="mt-4" aria-label="Session progress" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
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
