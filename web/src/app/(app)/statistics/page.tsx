"use client";

import Link from "next/link";
import { BarChart3, Bookmark, ChevronRight, Loader2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SubjectPerformanceChart } from "@/components/statistics/subject-performance-chart";
import { AccuracyTrendChart } from "@/components/statistics/accuracy-trend-chart";
import { DonutBreakdown } from "@/components/statistics/donut-breakdown";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { getStatistics } from "@/lib/selectors";
import { QUESTIONS } from "@/data/mock/questions";
import { cn } from "@/lib/utils";

function StatTile({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function StatisticsPage() {
  const sessions = usePracticeStore((s) => s.sessions);
  const sessionsHydrated = usePracticeStore((s) => s.hasHydrated);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const bookmarksHydrated = useBookmarksStore((s) => s.hasHydrated);

  if (!sessionsHydrated || !bookmarksHydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = getStatistics(Object.values(sessions), QUESTIONS, bookmarks);
  const subjectsWithAttempts = stats.bySubject.filter((s) => s.attempted > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance & Statistics"
        description="Track your accuracy, subject-wise strengths, and progress over time."
      />

      {stats.attempted === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No practice data yet"
          description="Attempt some questions to start seeing your performance statistics here."
          action={
            <Button render={<Link href="/question-bank" />}>Browse question bank</Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="Overall accuracy" value={`${stats.accuracy}%`} />
            <StatTile
              label="Attempted"
              value={`${stats.attempted}`}
              sub={`of ${stats.totalQuestions} questions`}
            />
            <StatTile
              label="Correct"
              value={`${stats.correct}`}
              className="bg-success/40 ring-success-foreground/10"
            />
            <StatTile
              label="Incorrect"
              value={`${stats.incorrect}`}
              className="bg-error/40 ring-error-foreground/10"
            />
            <StatTile
              label="Remaining"
              value={`${stats.unattempted}`}
              sub="never attempted"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Question bank coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                  {stats.coverage}%
                  <span className="ml-2 text-sm font-medium text-muted-foreground">
                    of the bank seen at least once
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {stats.attempted} attempted · {stats.unattempted} remaining
                </p>
              </div>
              <Progress value={stats.coverage} aria-label="Question bank coverage" />
              <p className="text-xs text-muted-foreground">
                Accuracy tells you how well you answer; coverage tells you how much of the bank
                you&apos;ve actually worked through.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Subject-wise performance</CardTitle>
              </CardHeader>
              <CardContent>
                {subjectsWithAttempts.length > 0 ? (
                  <SubjectPerformanceChart data={subjectsWithAttempts} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No subject data yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Correct / incorrect / unattempted</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutBreakdown
                  correct={stats.correct}
                  incorrect={stats.incorrect}
                  unattempted={stats.unattempted}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Accuracy over time</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.accuracyTrend.length >= 2 ? (
                <AccuracyTrendChart data={stats.accuracyTrend} />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Complete more tests to see your trend.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/revision"
              className={cn(
                "flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-error/50 text-error-foreground">
                  <XCircle className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Wrong questions</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.wrongQuestionCount} question{stats.wrongQuestionCount === 1 ? "" : "s"} to
                    revise
                  </p>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>

            <Link
              href="/bookmarks"
              className={cn(
                "flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-flag/50 text-flag-foreground">
                  <Bookmark className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Bookmarks</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.bookmarkCount} question{stats.bookmarkCount === 1 ? "" : "s"} saved
                  </p>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
