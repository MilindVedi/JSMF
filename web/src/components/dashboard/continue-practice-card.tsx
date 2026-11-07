"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
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
    examName: lookup.examName,
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
      // The same purple card as the empty state below: one card, two states,
      // and the state with a session waiting is the one least able to afford
      // looking like every other panel on the page.
      <div className="flex h-full flex-col justify-center rounded-xl bg-[linear-gradient(110deg,var(--brand-deep),var(--primary))] p-5 text-brand-on-deep shadow-editorial">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-brand-on-deep/70 uppercase">
              Continue where you left off
            </p>
            <p className="mt-1 font-heading text-2xl font-semibold text-brand-on-deep">
              {answered}{" "}
              <span className="text-base font-medium text-brand-on-deep/75">/ {total} completed</span>
            </p>
          </div>
          <Link
            href={`/practice/${inProgress.session.id}?i=${inProgress.resumeIndex}`}
            className={buttonVariants({ size: "lg", className: "cta-light w-fit shrink-0" })}
          >
            <span className="cta-shine" aria-hidden />
            Resume
            <ChevronRight className="cta-arrow size-4 transition-transform duration-300" />
          </Link>
        </div>

        {/* The track has to be drawn on the card's own colours: the default is
            a muted grey that disappears into the purple. */}
        <Progress
          value={percent}
          className="mt-4 bg-brand-on-deep/20 [&>*]:bg-brand-on-deep"
          aria-label="Session progress"
        />

        <p className="mt-3 text-sm text-brand-on-deep/75">{scopeLabel(inProgress, lookup)}</p>
      </div>
    );
  }

  return (
    // Brand purple rather than a white card: with no session running this is
    // the one thing on the dashboard asking to be acted on, and a card that
    // matches every other card does not ask. Its own colours throughout, so
    // nothing inherits a foreground meant for a light surface.
    <div className="flex h-full flex-col justify-center gap-4 rounded-xl bg-[linear-gradient(110deg,var(--brand-deep),var(--primary))] p-5 text-brand-on-deep shadow-editorial sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-brand-on-deep/70 uppercase">
          Start practising
        </p>
        <p className="mt-1 font-heading text-lg font-semibold text-brand-on-deep">
          No session in progress
        </p>
        {lastCompleted ? (
          <p className="mt-1 text-sm text-brand-on-deep/75">
            Last session: {scopeLabel(lastCompleted, lookup)} · {lastCompleted.accuracy}% accuracy
          </p>
        ) : (
          <p className="mt-1 text-sm text-brand-on-deep/75">
            Start practising from the Question Bank or build a Custom Test.
          </p>
        )}
      </div>
      {/* `shrink-0` so the two sit side by side: without it the long "Last
          session…" line squeezed this group until the second wrapped under
          the first. Their own colours rather than a button variant: on the
          purple card the usual primary would be purple on purple, so the
          first action is the light one and the second a tint of the card. */}
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <Link
          href="/question-bank"
          className={buttonVariants({ size: "sm", className: "cta-light" })}
        >
          <span className="cta-shine" aria-hidden />
          Question Bank
          <ArrowRight className="cta-arrow size-4 transition-transform duration-300" />
        </Link>
        <Link
          href="/custom-test/new"
          className={buttonVariants({
            size: "sm",
            className:
              "border-brand-on-deep/35 bg-transparent text-brand-on-deep hover:bg-brand-on-deep/15 hover:text-brand-on-deep",
          })}
        >
          Custom Test
        </Link>
      </div>
    </div>
  );
}
