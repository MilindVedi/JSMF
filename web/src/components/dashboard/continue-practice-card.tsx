"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { useTaxonomyLookup } from "@/hooks/pyq";
import type { SessionListItem } from "@jsmf/core/data-source";
import { sessionScopeLabel } from "@jsmf/core/domain";

type Lookup = ReturnType<typeof useTaxonomyLookup>;

/** The session's own type and what it covers — @jsmf/core's wording, shared with mobile. */
function scopeLabel(item: SessionListItem, lookup: Lookup) {
  return sessionScopeLabel(item, {
    examCount: lookup.taxonomy.exams.length,
    subjectCount: lookup.taxonomy.subjects.length,
    examName: (id) => lookup.exam(id)?.shortName ?? id,
    subjectName: (id) => lookup.subject(id)?.name ?? id,
  });
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
    <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
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
      {/* `shrink-0` so the two sit side by side: without it the long "Last
          session…" line squeezed this group until the second wrapped under
          the first. `secondary` rather than `outline` for the quieter of the
          two — an outline button is bg-card on a bg-card surface, which left
          Custom Test reading as a line of bold text rather than a button. */}
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <Link href="/question-bank" className={buttonVariants({ size: "sm" })}>
          Question Bank
        </Link>
        <Link href="/custom-test/new" className={buttonVariants({ size: "sm", variant: "secondary" })}>
          Custom Test
        </Link>
      </div>
    </div>
  );
}
