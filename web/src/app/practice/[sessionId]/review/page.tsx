"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { usePracticeStore } from "@/store/practice-store";
import { getQuestionById } from "@/data/mock/questions";
import { QuestionCard } from "@/components/practice/question-card";
import { ReviewExplanationPanel } from "@/components/practice/review-explanation-panel";
import { ReviewNavStrip } from "@/components/practice/review-nav-strip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/common/logo";
import { EmptyState } from "@/components/common/empty-state";
import type { TestSession } from "@/types";

type ReviewFilter = "all" | "correct" | "incorrect" | "unattempted";
type QuestionStatus = "correct" | "incorrect" | "unattempted";

function statusOf(session: TestSession, questionId: string): QuestionStatus {
  const attempt = session.attempts[questionId];
  if (!attempt) return "unattempted";
  return attempt.isCorrect ? "correct" : "incorrect";
}

/** First question in the session matching a filter, so switching filters (or
 *  landing with none set) lands somewhere that filter actually shows. */
function firstIndexForFilter(session: TestSession, filter: ReviewFilter): number {
  if (filter === "all") return 0;
  const i = session.questionIds.findIndex((id) => statusOf(session, id) === filter);
  return i === -1 ? 0 : i;
}

/** The nearest question in `indices` on one side of `current` — wraps around
 *  so Prev/Next always has somewhere to go within the active filter. */
function neighborIndex(indices: number[], current: number, direction: 1 | -1): number | null {
  if (indices.length === 0) return null;
  if (direction === 1) {
    return indices.find((i) => i > current) ?? indices[0];
  }
  const before = indices.filter((i) => i < current);
  return before.length > 0 ? before[before.length - 1] : indices[indices.length - 1];
}

export default function ReviewPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const searchParams = useSearchParams();
  const router = useRouter();

  const session = usePracticeStore((s) => s.sessions[sessionId]);
  const hasHydrated = usePracticeStore((s) => s.hasHydrated);

  const filterParam = searchParams.get("filter") as ReviewFilter | null;
  const iParam = searchParams.get("i");

  const counts = useMemo(() => {
    if (!session) return { all: 0, correct: 0, incorrect: 0, unattempted: 0 };
    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;
    for (const id of session.questionIds) {
      const s = statusOf(session, id);
      if (s === "correct") correct += 1;
      else if (s === "incorrect") incorrect += 1;
      else unattempted += 1;
    }
    return { all: session.questionIds.length, correct, incorrect, unattempted };
  }, [session]);

  // Land on "incorrect" by default when there's anything to review — that's
  // the whole point of opening review from a completed test.
  const defaultFilter: ReviewFilter = counts.incorrect > 0 ? "incorrect" : "all";
  const filter: ReviewFilter = filterParam ?? defaultFilter;

  const total = session?.questionIds.length ?? 0;
  const rawIndex = iParam !== null ? Number(iParam) : session ? firstIndexForFilter(session, filter) : 0;
  const index = Number.isFinite(rawIndex) ? Math.min(Math.max(rawIndex, 0), Math.max(total - 1, 0)) : 0;

  // Redirect once to a canonical URL carrying both params, so the back
  // button and direct links always show a stable, shareable state.
  useEffect(() => {
    if (session && (filterParam === null || iParam === null)) {
      router.replace(`/practice/${sessionId}/review?i=${index}&filter=${filter}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, filterParam, iParam]);

  if (!hasHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <EmptyState
          icon={AlertTriangle}
          title="This session doesn't exist"
          description="It may have expired, or the link is incorrect."
          action={<Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>}
        />
      </div>
    );
  }

  const questionId = session.questionIds[index];
  const question = questionId ? getQuestionById(questionId) : undefined;
  if (!question) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredIndices = session.questionIds
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => filter === "all" || statusOf(session, id) === filter)
    .map(({ i }) => i);

  function setFilter(next: ReviewFilter) {
    const nextIndex = firstIndexForFilter(session!, next);
    router.replace(`/practice/${sessionId}/review?i=${nextIndex}&filter=${next}`);
  }

  function jump(newIndex: number) {
    router.replace(`/practice/${sessionId}/review?i=${newIndex}&filter=${filter}`);
  }

  function goRelative(direction: 1 | -1) {
    const next = neighborIndex(filteredIndices, index, direction);
    if (next !== null) jump(next);
  }

  const attempt = session.attempts[question.id];
  const status = statusOf(session, question.id);
  const positionInFilter = filteredIndices.indexOf(index);

  const FILTERS: { value: ReviewFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "correct", label: "Correct", count: counts.correct },
    { value: "incorrect", label: "Incorrect", count: counts.incorrect },
    { value: "unattempted", label: "Unattempted", count: counts.unattempted },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background px-3 sm:px-5">
        <div className="flex h-14 items-center gap-3">
          <Link
            href={`/practice/${sessionId}/results`}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back to results</span>
          </Link>
          <div className="hidden sm:block">
            <Logo className="scale-90" />
          </div>
          <p className="mx-auto text-sm font-medium text-muted-foreground">
            Reviewing: {session.label} · {total} question{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="pb-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as ReviewFilter)}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value} disabled={f.count === 0}>
                  {f.label}
                  <span className="ml-1.5 text-xs text-muted-foreground">{f.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="border-b border-border bg-card/40 px-3 py-2.5 sm:px-5">
        <ReviewNavStrip
          questionIds={session.questionIds}
          attempts={session.attempts}
          visibleIndices={filteredIndices}
          currentIndex={index}
          onJump={jump}
        />
      </div>

      <div className="mx-auto w-full max-w-[760px] flex-1 px-4 py-6 sm:py-8">
        {filteredIndices.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Nothing in this filter"
            description="Choose a different filter above to keep reviewing."
          />
        ) : (
          <>
            <QuestionCard
              question={question}
              submitted
              selectedOptionId={attempt?.selectedOptionId ?? null}
              onSelect={() => {}}
            />
            <div className="mt-5">
              <ReviewExplanationPanel question={question} status={status} />
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/85 sm:px-5">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3">
          <Button variant="outline" size="lg" onClick={() => goRelative(-1)} disabled={filteredIndices.length <= 1}>
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <p className="text-sm text-muted-foreground">
            {positionInFilter >= 0 ? positionInFilter + 1 : "–"} of {filteredIndices.length} · Q{index + 1}
          </p>
          <Button variant="outline" size="lg" onClick={() => goRelative(1)} disabled={filteredIndices.length <= 1}>
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
