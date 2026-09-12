"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { History as HistoryIcon, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionHistoryRow, SESSION_MODE_LABEL } from "@/components/history/session-history-row";
import { MultiSelectPopover } from "@/components/question-bank/multi-select-popover";
import { SortDropdown } from "@/components/common/sort-dropdown";
import { DateRangePicker } from "@/components/common/date-range-picker";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { useCollectionsStore } from "@/store/collections-store";
import { QUESTIONS } from "@/data/mock/questions";
import { getSessionSummary, getStatistics } from "@/lib/selectors";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import { cn } from "@/lib/utils";
import type { SessionMode, TestSession } from "@/types";

type ModeFilter = SessionMode | "all" | "collections";
type PeriodFilter = "all" | "7d" | "30d" | "custom";

const PERIODS: { value: PeriodFilter; label: string; days?: number }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "custom", label: "Custom range" },
];

type SessionSortOption =
  | "recently-attempted"
  | "least-recently-attempted"
  | "newest-exam-year"
  | "oldest-exam-year"
  | "highest-accuracy"
  | "lowest-accuracy"
  | "recently-wrong"
  | "oldest-wrong"
  | "name-az"
  | "name-za"
  | "unattempted";

const SESSION_SORT_LABELS: Record<SessionSortOption, string> = {
  "recently-attempted": "Recently attempted",
  "least-recently-attempted": "Least recently attempted",
  "newest-exam-year": "Most recent — latest exam",
  "oldest-exam-year": "Oldest first",
  "highest-accuracy": "Highest accuracy",
  "lowest-accuracy": "Lowest accuracy",
  "recently-wrong": "Recently wrong",
  "oldest-wrong": "Oldest wrong",
  "name-az": "Name A–Z",
  "name-za": "Name Z–A",
  unattempted: "Unattempted",
};

/** Opposite-direction pairs share a group id so the sort dropdown can tint
 *  each pair distinctly — see `SortDropdownOption.group`. */
const SESSION_SORT_GROUPS: Partial<Record<SessionSortOption, string>> = {
  "recently-attempted": "attempted",
  "least-recently-attempted": "attempted",
  "newest-exam-year": "exam-year",
  "oldest-exam-year": "exam-year",
  "highest-accuracy": "accuracy",
  "lowest-accuracy": "accuracy",
  "recently-wrong": "wrong",
  "oldest-wrong": "wrong",
  "name-az": "name",
  "name-za": "name",
};

const SESSION_SORT_DROPDOWN_OPTIONS = (Object.keys(SESSION_SORT_LABELS) as SessionSortOption[]).map((value) => ({
  value,
  label: SESSION_SORT_LABELS[value],
  group: SESSION_SORT_GROUPS[value],
}));

interface SessionSortKeys {
  newestYear: number;
  oldestYear: number;
  lastWrongAt?: string;
  accuracy: number;
  unattemptedCount: number;
}

function buildSessionSortKeys(session: TestSession, questionMap: Map<string, { year: number }>): SessionSortKeys {
  let newestYear = -Infinity;
  let oldestYear = Infinity;
  for (const id of session.questionIds) {
    const year = questionMap.get(id)?.year;
    if (year === undefined) continue;
    if (year > newestYear) newestYear = year;
    if (year < oldestYear) oldestYear = year;
  }
  let lastWrongAt: string | undefined;
  for (const attempt of Object.values(session.attempts)) {
    if (attempt.isCorrect) continue;
    if (!lastWrongAt || attempt.answeredAt > lastWrongAt) lastWrongAt = attempt.answeredAt;
  }
  const attempts = Object.values(session.attempts);
  const correct = attempts.filter((a) => a.isCorrect).length;
  const accuracy = attempts.length > 0 ? Math.round((correct / attempts.length) * 100) : 0;
  const unattemptedCount = session.questionIds.length - attempts.length;
  return { newestYear, oldestYear, lastWrongAt, accuracy, unattemptedCount };
}

/** Missing values (e.g. a session with no wrong attempts) always sort last,
 *  in either direction — it isn't "the oldest wrong", it just has none. */
function compareOptionalString(a: string | undefined, b: string | undefined, direction: "asc" | "desc") {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (a === b) return 0;
  const cmp = a < b ? -1 : 1;
  return direction === "desc" ? -cmp : cmp;
}

function sortSessions(
  sessions: TestSession[],
  sort: SessionSortOption,
  keysById: Map<string, SessionSortKeys>
): TestSession[] {
  const arr = [...sessions];
  const keyOf = (s: TestSession) => keysById.get(s.id)!;
  switch (sort) {
    case "recently-attempted":
      arr.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
      break;
    case "least-recently-attempted":
      arr.sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
      break;
    case "newest-exam-year":
      arr.sort((a, b) => keyOf(b).newestYear - keyOf(a).newestYear);
      break;
    case "oldest-exam-year":
      arr.sort((a, b) => keyOf(a).oldestYear - keyOf(b).oldestYear);
      break;
    case "highest-accuracy":
      arr.sort((a, b) => keyOf(b).accuracy - keyOf(a).accuracy);
      break;
    case "lowest-accuracy":
      arr.sort((a, b) => keyOf(a).accuracy - keyOf(b).accuracy);
      break;
    case "recently-wrong":
      arr.sort((a, b) => compareOptionalString(keyOf(a).lastWrongAt, keyOf(b).lastWrongAt, "desc"));
      break;
    case "oldest-wrong":
      arr.sort((a, b) => compareOptionalString(keyOf(a).lastWrongAt, keyOf(b).lastWrongAt, "asc"));
      break;
    case "name-az":
      arr.sort((a, b) => a.label.localeCompare(b.label));
      break;
    case "name-za":
      arr.sort((a, b) => b.label.localeCompare(a.label));
      break;
    case "unattempted":
      arr.sort((a, b) => keyOf(b).unattemptedCount - keyOf(a).unattemptedCount);
      break;
  }
  return arr;
}

export default function HistoryPage() {
  const hasHydratedPractice = usePracticeStore((s) => s.hasHydrated);
  const hasHydratedBookmarks = useBookmarksStore((s) => s.hasHydrated);
  const hasHydratedCollections = useCollectionsStore((s) => s.hasHydrated);
  const sessions = usePracticeStore((s) => s.sessions);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const collections = useCollectionsStore((s) => s.collections);
  const hasHydrated = hasHydratedPractice && hasHydratedBookmarks && hasHydratedCollections;

  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [collectionFilterIds, setCollectionFilterIds] = useState<string[]>([]);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState<SessionSortOption>("recently-wrong");

  const questionMap = useMemo(() => new Map(QUESTIONS.map((q) => [q.id, q] as const)), []);

  // Day granularity keeps this value stable between renders.
  const sinceDay = useClientSnapshot<string | null>(() => {
    const days = PERIODS.find((p) => p.value === periodFilter)?.days;
    if (!days) return null;
    return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  }, null);

  const statistics = useMemo(
    () => (hasHydrated ? getStatistics(Object.values(sessions), QUESTIONS, bookmarks) : null),
    [hasHydrated, sessions, bookmarks]
  );

  const allCompletedSessions = useMemo(() => {
    if (!hasHydrated) return [];
    return Object.values(sessions)
      .filter((s) => s.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  }, [hasHydrated, sessions]);

  const modeCounts = useMemo(() => {
    const counts: Record<ModeFilter, number> = {
      all: allCompletedSessions.length,
      browse: 0,
      "custom-test": 0,
      bookmarks: 0,
      "wrong-questions": 0,
      collections: 0,
    };
    for (const s of allCompletedSessions) {
      counts[s.mode] += 1;
      if (s.filters?.collectionIds && s.filters.collectionIds.length > 0) counts.collections += 1;
    }
    return counts;
  }, [allCompletedSessions]);

  const sessionSortKeys = useMemo(() => {
    const map = new Map<string, SessionSortKeys>();
    for (const s of allCompletedSessions) map.set(s.id, buildSessionSortKeys(s, questionMap));
    return map;
  }, [allCompletedSessions, questionMap]);

  const completedSessions = useMemo(() => {
    const filtered = allCompletedSessions.filter((s) => {
      if (modeFilter === "collections") {
        if (!s.filters?.collectionIds || s.filters.collectionIds.length === 0) return false;
      } else if (modeFilter !== "all" && s.mode !== modeFilter) {
        return false;
      }
      const day = s.completedAt!.slice(0, 10);
      if (periodFilter === "custom") {
        if (customFrom && day < customFrom) return false;
        if (customTo && day > customTo) return false;
      } else if (sinceDay && day < sinceDay) {
        return false;
      }
      if (
        collectionFilterIds.length > 0 &&
        !collectionFilterIds.some((id) => s.filters?.collectionIds?.includes(id))
      ) {
        return false;
      }
      return true;
    });
    return sortSessions(filtered, sort, sessionSortKeys);
  }, [allCompletedSessions, modeFilter, sinceDay, collectionFilterIds, periodFilter, customFrom, customTo, sort, sessionSortKeys]);

  if (!hasHydrated || !statistics) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attempt History"
        description="A record of every question you've attempted across all sessions."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Attempted" value={statistics.attempted} tone="muted" />
        <SummaryTile label="Correct" value={statistics.correct} tone="success" />
        <SummaryTile label="Incorrect" value={statistics.incorrect} tone="error" />
        <SummaryTile label="Unattempted" value={statistics.unattempted} tone="muted" />
      </div>

      {allCompletedSessions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={modeFilter} onValueChange={(v) => setModeFilter(v as ModeFilter)}>
            <TabsList>
              <TabsTrigger value="all">
                All<span className="ml-1.5 text-xs text-muted-foreground">{modeCounts.all}</span>
              </TabsTrigger>
              {(Object.keys(SESSION_MODE_LABEL) as SessionMode[]).map((mode) => (
                <TabsTrigger key={mode} value={mode}>
                  {SESSION_MODE_LABEL[mode]}
                  <span className="ml-1.5 text-xs text-muted-foreground">{modeCounts[mode]}</span>
                </TabsTrigger>
              ))}
              {collections.length > 0 && (
                <TabsTrigger value="collections">
                  Collections
                  <span className="ml-1.5 text-xs text-muted-foreground">{modeCounts.collections}</span>
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriodFilter(p.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  periodFilter === p.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
              >
                {p.label}
              </button>
            ))}
            {periodFilter === "custom" && (
              <DateRangePicker
                from={customFrom}
                to={customTo}
                onChange={(from, to) => {
                  setCustomFrom(from);
                  setCustomTo(to);
                }}
              />
            )}
            <SortDropdown value={sort} options={SESSION_SORT_DROPDOWN_OPTIONS} onChange={setSort} />
          </div>
        </div>
      )}

      {allCompletedSessions.length > 0 && collections.length > 0 && modeFilter === "collections" && (
        <MultiSelectPopover
          label="Collection"
          triggerLabel={
            collectionFilterIds.length === 0
              ? "All Collections"
              : collectionFilterIds.length === 1
                ? (collections.find((c) => c.id === collectionFilterIds[0])?.name ?? "Collection")
                : `${collectionFilterIds.length} Collections`
          }
          allOption="All Collections"
          options={collections.map((c) => ({ id: c.id, label: c.name }))}
          selected={collectionFilterIds}
          onChange={setCollectionFilterIds}
        />
      )}

      {allCompletedSessions.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No completed sessions yet"
          description="Finish a practice session from the Question Bank or a Custom Test to see it appear here."
          action={
            <Link href="/question-bank" className={buttonVariants({ size: "sm" })}>
              Go to Question Bank
            </Link>
          }
        />
      ) : completedSessions.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No sessions match these filters"
          description="Try a different session type or time period."
        />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-border">
            {completedSessions.map((session) => {
              const summary = getSessionSummary(session, QUESTIONS);
              return (
                <SessionHistoryRow
                  key={session.id}
                  session={session}
                  accuracy={summary.accuracy}
                  correct={summary.correct}
                  incorrect={summary.incorrect}
                  unattempted={summary.unattempted}
                />
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "error" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border px-3 py-3 text-center",
        tone === "success" && "bg-success/50",
        tone === "error" && "bg-error/50",
        tone === "muted" && "bg-muted/50"
      )}
    >
      <p className="font-heading text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
