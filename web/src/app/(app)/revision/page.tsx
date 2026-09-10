"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SubjectBadge } from "@/components/common/subject-badge";
import { QuestionListRow } from "@/components/question-bank/question-list-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { QUESTIONS, getQuestionById } from "@/data/mock/questions";
import { getQuestionStatusMap, getWrongQuestionFacets } from "@/lib/selectors";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import { useStartSession } from "@/lib/use-start-session";
import type { Question } from "@/types";

const RECENT_WINDOW_DAYS = 7;
const MAX_ROWS = 50;

type Mode = "all" | "recent" | "never" | "subject";

export default function RevisionPage() {
  const practiceHydrated = usePracticeStore((s) => s.hasHydrated);
  const bookmarksHydrated = useBookmarksStore((s) => s.hasHydrated);
  const sessions = usePracticeStore((s) => s.sessions);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const startSession = useStartSession();

  const [mode, setMode] = useState<Mode>("all");

  // Day granularity keeps this value stable between renders.
  const recentSinceDay = useClientSnapshot<string | null>(
    () => new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10),
    null
  );

  const hasHydrated = practiceHydrated && bookmarksHydrated;
  const sessionList = useMemo(() => Object.values(sessions), [sessions]);

  const facets = useMemo(
    () => getWrongQuestionFacets(sessionList, QUESTIONS, recentSinceDay),
    [sessionList, recentSinceDay]
  );
  const statusMap = useMemo(() => getQuestionStatusMap(sessionList), [sessionList]);

  const bookmarkedQuestions = useMemo(
    () =>
      bookmarks
        .map((b) => getQuestionById(b.questionId))
        .filter((q): q is Question => Boolean(q)),
    [bookmarks]
  );

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const MODES: { value: Mode; label: string; count?: number }[] = [
    { value: "all", label: "All wrong", count: facets.all.length },
    { value: "recent", label: "Recently wrong", count: facets.recent.length },
    { value: "never", label: "Never corrected", count: facets.neverCorrected.length },
    { value: "subject", label: "By subject" },
  ];

  const activeList =
    mode === "recent" ? facets.recent : mode === "never" ? facets.neverCorrected : facets.all;

  const MODE_BLURB: Record<Mode, string> = {
    all: "Every question whose most recent attempt was incorrect.",
    never: "Attempted before and still never answered correctly — your hardest set.",
    recent: `Got wrong in the last ${RECENT_WINDOW_DAYS} days.`,
    subject: "Where your wrong answers are concentrated.",
  };

  function practise(label: string, questions: Question[]) {
    startSession({
      mode: "wrong-questions",
      label,
      questionIds: questions.map((q) => q.id),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revision"
        description="Everything worth another look — the questions you got wrong, and the ones you saved."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-error text-error-foreground">
            <XCircle className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-heading text-xl leading-tight font-semibold text-foreground">
              {facets.all.length}
            </p>
            <p className="text-xs text-muted-foreground">to revise</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Bookmark className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-heading text-xl leading-tight font-semibold text-foreground">
              {bookmarkedQuestions.length}
            </p>
            <p className="text-xs text-muted-foreground">bookmarked</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Questions you got wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              {MODES.map((m) => (
                <TabsTrigger key={m.value} value={m.value}>
                  {m.label}
                  {m.count !== undefined && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{m.count}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{MODE_BLURB[mode]}</p>
            {mode !== "subject" && activeList.length > 0 && (
              <Button
                onClick={() =>
                  practise(
                    mode === "recent"
                      ? "Recently Wrong Revision"
                      : mode === "never"
                        ? "Never Corrected Revision"
                        : "Wrong Questions Revision",
                    activeList
                  )
                }
              >
                Practise these {activeList.length}
              </Button>
            )}
          </div>

          {mode === "subject" ? (
            facets.bySubject.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing to revise yet"
                description="Questions you get wrong will be grouped by subject here."
              />
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {facets.bySubject.map(({ subjectId, questions }) => (
                  <div
                    key={subjectId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <SubjectBadge subjectId={subjectId} />
                      <span className="text-sm text-muted-foreground">
                        {questions.length} question{questions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => practise("Wrong Questions Revision", questions)}
                    >
                      Practise
                    </Button>
                  </div>
                ))}
              </div>
            )
          ) : activeList.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={
                mode === "recent"
                  ? `Nothing wrong in the last ${RECENT_WINDOW_DAYS} days`
                  : mode === "never"
                    ? "Nothing stuck in the never-corrected pile"
                    : "No wrong questions yet — keep practising!"
              }
              description="Questions you get wrong show up here so you can revise them until they stick."
              action={
                <Link href="/question-bank" className={buttonVariants({ size: "sm" })}>
                  Go to Question Bank
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {activeList.slice(0, MAX_ROWS).map((q) => (
                <QuestionListRow
                  key={q.id}
                  question={q}
                  status={statusMap.get(q.id) ?? "incorrect"}
                  onClick={() => practise("Wrong Question Review", [q])}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Bookmarked questions</CardTitle>
          {bookmarkedQuestions.length > 0 && (
            <Button
              size="sm"
              onClick={() =>
                startSession({
                  mode: "bookmarks",
                  label: "My Bookmarks",
                  questionIds: bookmarkedQuestions.map((q) => q.id),
                })
              }
            >
              Practise all {bookmarkedQuestions.length}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {bookmarkedQuestions.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No bookmarks yet"
              description="Save questions while practising to revisit them here."
            />
          ) : (
            <>
              <div className="divide-y divide-border rounded-xl border border-border">
                {bookmarkedQuestions.slice(0, 5).map((q) => (
                  <QuestionListRow
                    key={q.id}
                    question={q}
                    status={statusMap.get(q.id) ?? "unattempted"}
                    onClick={() =>
                      startSession({
                        mode: "browse",
                        label: "Bookmarked Question",
                        questionIds: [q.id],
                      })
                    }
                  />
                ))}
              </div>
              {bookmarkedQuestions.length > 5 && (
                <Link
                  href="/bookmarks"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
                >
                  View all {bookmarkedQuestions.length} bookmarks
                  <ChevronRight className="size-4" />
                </Link>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
