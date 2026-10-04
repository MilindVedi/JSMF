"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { useTaxonomyLookup } from "@/hooks/pyq";
import type { SessionListItem } from "@/lib/data-source";

type Lookup = ReturnType<typeof useTaxonomyLookup>;

function scopeDescription(item: SessionListItem, lookup: Lookup) {
  const { examIds, subjectIds, totalQuestions: questionCount } = item;
  const { exams, subjects } = lookup.taxonomy;

  const examNames = examIds.map((id) => lookup.exam(id)?.shortName ?? id);
  const subjectNames = subjectIds.map((id) => lookup.subject(id)?.name ?? id);

  // Name what's actually covered when it's a short list; fall back to a count
  // only when spelling it out would be noise. Empty means "not narrowed".
  const exam =
    examIds.length === 0 || examIds.length >= exams.length
      ? "All exams"
      : examNames.length <= 2
        ? examNames.join(" & ")
        : `${examIds.length} exams`;
  const subject =
    subjectIds.length === 0 || subjectIds.length >= subjects.length
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
 * line: the session's own type (`session.label`, set once at creation by
 * whichever screen started it) followed by what it actually covers.
 */
function scopeLabel(item: SessionListItem, lookup: Lookup) {
  return `${item.session.label} · ${scopeDescription(item, lookup)}`;
}

export function ContinuePracticeCard({
  inProgress,
  lastCompleted,
}: {
  inProgress?: SessionListItem;
  lastCompleted?: SessionListItem;
}) {
  const lookup = useTaxonomyLookup();

  if (inProgress) {
    const answered = inProgress.attempted;
    const total = inProgress.totalQuestions;
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
            href={`/practice/${inProgress.session.id}?i=${inProgress.resumeIndex}`}
            className={buttonVariants({ size: "lg", className: "w-fit shrink-0" })}
          >
            Resume
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <Progress value={percent} className="mt-4" aria-label="Session progress" />

        <p className="mt-3 text-sm text-muted-foreground">{scopeLabel(inProgress, lookup)}</p>
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
            Last session: {scopeLabel(lastCompleted, lookup)} · {lastCompleted.accuracy}% accuracy
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
