"use client";

import { useMemo } from "react";
import Link from "next/link";
import { History as HistoryIcon, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SessionHistoryRow } from "@/components/history/session-history-row";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { QUESTIONS } from "@/data/mock/questions";
import { getSessionSummary, getStatistics } from "@/lib/selectors";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  const hasHydratedPractice = usePracticeStore((s) => s.hasHydrated);
  const hasHydratedBookmarks = useBookmarksStore((s) => s.hasHydrated);
  const sessions = usePracticeStore((s) => s.sessions);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const hasHydrated = hasHydratedPractice && hasHydratedBookmarks;

  const statistics = useMemo(
    () => (hasHydrated ? getStatistics(Object.values(sessions), QUESTIONS, bookmarks) : null),
    [hasHydrated, sessions, bookmarks]
  );

  const completedSessions = useMemo(() => {
    if (!hasHydrated) return [];
    return Object.values(sessions)
      .filter((s) => s.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  }, [hasHydrated, sessions]);

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

      {completedSessions.length === 0 ? (
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
