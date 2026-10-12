"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { History as HistoryIcon, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionHistoryRow, SESSION_MODE_LABEL } from "@/components/history/session-history-row";
import { MultiSelectPopover } from "@/components/question-bank/multi-select-popover";
import { SortDropdown } from "@/components/common/sort-dropdown";
import { DateRangePicker } from "@/components/common/date-range-picker";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import { cn } from "@/lib/utils";
import { PageLoading, QueryError } from "@/components/pyq/query-states";
import { pyqCapabilities, useCollections, useInfiniteSessionHistory, useStats } from "@/hooks/pyq";
import {
  SESSION_SORT_GROUPS,
  SESSION_SORT_LABELS,
  buildSessionSortKeys,
  sortSessions,
  type SessionMode,
  type SessionSortKeys,
  type SessionSortOption,
} from "@jsmf/core/domain";

type ModeFilter = SessionMode | "all" | "collections";
type PeriodFilter = "all" | "7d" | "30d" | "custom";

const PERIODS: { value: PeriodFilter; label: string; days?: number }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "custom", label: "Custom range" },
];

// Sorting finished sessions is @jsmf/core's, shared with the mobile app.
const SESSION_SORT_DROPDOWN_OPTIONS = (Object.keys(SESSION_SORT_LABELS) as SessionSortOption[]).map((value) => ({
  value,
  label: SESSION_SORT_LABELS[value],
  group: SESSION_SORT_GROUPS[value],
}));

export default function HistoryPage() {
  const stats = useStats();
  // Only finished sessions are listed here; older pages load on request.
  const history = useInfiniteSessionHistory("submitted");
  const loadedItems = useMemo(() => history.data?.pages.flatMap((page) => page.items) ?? [], [history.data]);
  const { data: storedCollections } = useCollections();
  const collections = pyqCapabilities.collections ? (storedCollections ?? []) : [];

  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [collectionFilterIds, setCollectionFilterIds] = useState<string[]>([]);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState<SessionSortOption>("recently-wrong");

  // Day granularity keeps this value stable between renders.
  const sinceDay = useClientSnapshot<string | null>(() => {
    const days = PERIODS.find((p) => p.value === periodFilter)?.days;
    if (!days) return null;
    return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  }, null);

  const statistics = stats.data;
  const itemsById = useMemo(
    () => new Map(loadedItems.map((item) => [item.session.id, item] as const)),
    [loadedItems]
  );

  const allCompletedSessions = useMemo(
    () =>
      loadedItems
        .filter((item) => item.submitted && item.session.completedAt)
        .map((item) => item.session)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()),
    [loadedItems]
  );

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
    for (const item of itemsById.values()) map.set(item.session.id, buildSessionSortKeys(item));
    return map;
  }, [itemsById]);

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

  const error = stats.error ?? history.error;
  if (error) {
    return (
      <QueryError
        error={error}
        title="Couldn't load your history"
        onRetry={() => {
          void stats.refetch();
          void history.refetch();
        }}
      />
    );
  }

  if (!statistics || !history.data) return <PageLoading />;

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
              const summary = itemsById.get(session.id)!;
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

      {history.hasNextPage && (
        <div className="flex flex-col items-center gap-1.5">
          <Button variant="outline" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
            {history.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : "Load older sessions"}
          </Button>
          <p className="text-xs text-muted-foreground">Filters and sorting apply to the sessions loaded so far.</p>
        </div>
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
