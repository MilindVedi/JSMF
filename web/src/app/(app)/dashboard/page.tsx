"use client";

import {
  BookOpen,
  Bookmark,
  ClipboardList,
  Repeat,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { SubjectBadge } from "@/components/common/subject-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { QuickActionCard } from "@/components/dashboard/quick-action-card";
import { StreakCard } from "@/components/dashboard/streak-card";
import { ContinuePracticeCard } from "@/components/dashboard/continue-practice-card";
import { OnboardingDashboard } from "@/components/dashboard/onboarding-dashboard";
import { TestSummaryCard } from "@/components/history/test-summary-card";
import { useAuthStore } from "@/store/auth-store";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import { usePreferences, useSessionHistory, useStartSession, useStats, useTaxonomy } from "@/hooks/pyq";
import { useStreakState } from "@/lib/use-streak-state";
import { PageLoading, QueryError } from "@/components/pyq/query-states";
import { greetingForHour, streakCheckInLine, streakEyebrow } from "@jsmf/core/domain";

export default function DashboardPage() {
  const hasHydratedAuth = useAuthStore((s) => s.hasHydrated);
  const profile = useAuthStore((s) => s.profile);
  const startSession = useStartSession();
  const stats = useStats();
  // Exactly what the page shows: the session to resume and the last four
  // finished. `total` on each also tells whether this is a brand-new account.
  const open = useSessionHistory(1, 1, "open");
  const finished = useSessionHistory(1, 4, "submitted");
  const { data: preferences } = usePreferences();
  const { data: taxonomy } = useTaxonomy();
  const streak = useStreakState();
  const targetExamId = preferences?.targetExamId ?? profile.targetExamId;
  /** "NEET-PG · FMGE · INI-CET" — empty until the taxonomy has loaded. */
  const examsCovered = taxonomy?.exams.map((exam) => exam.shortName).join(" · ") ?? "";

  const greeting = useClientSnapshot(() => greetingForHour(new Date().getHours()), "Welcome back");

  const error = stats.error ?? open.error ?? finished.error;
  if (error) {
    return (
      <QueryError
        error={error}
        title="Couldn't load your dashboard"
        onRetry={() => {
          void stats.refetch();
          void open.refetch();
          void finished.refetch();
        }}
      />
    );
  }

  const statistics = stats.data;
  if (!hasHydratedAuth || !statistics || !open.data || !finished.data) return <PageLoading />;

  // The most recently *started* unfinished session (newest first), so
  // "Continue where you left off" resumes the one the user was actually in.
  const inProgress = open.data.items[0];
  const recentSessions = finished.data.items;
  const focusAreas = statistics.bySubject
    .filter((s) => s.attempted > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  const firstName = profile.name.split(" ")[0];

  // No session ever created — a genuinely new account, not just "nothing in
  // progress right now." The onboarding dashboard replaces the whole page
  // rather than leaving a grid of zeroed-out stat cards and empty sections.
  if (open.data.total + finished.data.total === 0) {
    const startFirstPractice = () =>
      startSession({
        mode: "browse",
        label: "Question Bank",
        filters: { examIds: [targetExamId] },
        count: 10,
      });

    return (
      <OnboardingDashboard
        firstName={firstName}
        targetExamId={targetExamId}
        hasBookmark={statistics.bookmarkCount > 0}
        hasStreak={streak.currentStreak > 0}
        onStartFirstPractice={startFirstPractice}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* The page's own masthead rather than the shared PageHeader, matching
          the Question Bank's. Both lines under the greeting are drawn from
          today's real figures, so this reads as a check-in rather than a
          slogan that says the same thing every morning. The count itself is
          left to the topbar and Today's goal — three times on one screen
          would be twice too many. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="eyebrow">
            <Sparkles className="size-3.5" />
            {streakEyebrow(streak.currentStreak)}
          </span>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {greeting}, {firstName}
            <span className="text-primary">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">{streakCheckInLine(streak)}</p>
        </div>
        {/* The exams the bank covers, read from the taxonomy rather than
            written here, so renaming or adding one in admin carries through.
            Shaped like the Question Bank's masthead pill, which this header
            already mirrors. */}
        {examsCovered && (
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground">
            <BookOpen className="size-4 text-primary" />
            {examsCovered}
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Each number stands alone, with what it is out of underneath —
            "10 / 187" at display size read as a fraction to work out rather
            than a count to take in. Every hint comes from the same `stats`
            payload the number does; nothing here is invented. */}
        <StatCard
          icon={TrendingUp}
          label="Overall accuracy"
          value={`${statistics.accuracy}%`}
          hint={`${statistics.correct} correct ${statistics.correct === 1 ? "answer" : "answers"}`}
        />
        <StatCard
          icon={ClipboardList}
          label="Questions attempted"
          value={statistics.attempted}
          hint={`of ${statistics.totalQuestions} questions`}
        />
        <StatCard
          icon={XCircle}
          label="Wrong questions"
          value={statistics.wrongQuestionCount}
          hint="Room to improve"
          tone="error"
        />
        <StatCard
          icon={Bookmark}
          label="Bookmarked"
          value={statistics.bookmarkCount}
          hint="Saved for later"
          tone="flag"
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <div className="h-full lg:col-span-2">
          <ContinuePracticeCard inProgress={inProgress} lastCompleted={recentSessions[0]} />
        </div>
        <StreakCard />
      </div>

      <div>
        <h2 className="mb-3 font-heading text-sm font-semibold text-foreground">Quick actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            icon={BookOpen}
            label="Question Bank"
            description="Browse and practice PYQs by subject, topic, and year."
            href="/question-bank"
          />
          <QuickActionCard
            icon={Sparkles}
            label="Custom Test"
            description="Build a tailored test with your own filters and settings."
            href="/custom-test/new"
          />
          <QuickActionCard
            icon={Repeat}
            label="Revision"
            description="Revisit what you got wrong and the questions you saved."
            href="/revision"
          />
          <QuickActionCard
            icon={Bookmark}
            label="Bookmarks"
            description="Revisit questions you've saved for later."
            href="/bookmarks"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Recent activity</h2>
          {recentSessions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No completed sessions yet — finish a practice session to see it here.
            </p>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((item) => (
                <TestSummaryCard
                  key={item.session.id}
                  session={item.session}
                  accuracy={item.accuracy}
                  correct={item.correct}
                  incorrect={item.incorrect}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">Focus areas</h2>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="space-y-2">
              {focusAreas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Attempt more questions to see focus areas.</p>
              ) : (
                // The same number, drawn as well as written: a column of
                // percentages is read one at a time, a column of bars is read
                // at a glance, which is the whole point of "focus areas".
                focusAreas.map((s) => (
                  <div key={s.subjectId} className="space-y-1.5 py-1">
                    <div className="flex items-center justify-between gap-3">
                      <SubjectBadge subjectId={s.subjectId} />
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                        {s.accuracy}%
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${s.accuracy}% accuracy`}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500"
                        style={{ width: `${s.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
