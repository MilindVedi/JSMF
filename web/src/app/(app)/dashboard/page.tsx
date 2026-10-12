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
import { PageHeader } from "@/components/common/page-header";
import { SubjectBadge } from "@/components/common/subject-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { QuickActionCard } from "@/components/dashboard/quick-action-card";
import { StreakCard } from "@/components/dashboard/streak-card";
import { ContinuePracticeCard } from "@/components/dashboard/continue-practice-card";
import { OnboardingDashboard } from "@/components/dashboard/onboarding-dashboard";
import { TestSummaryCard } from "@/components/history/test-summary-card";
import { useAuthStore } from "@/store/auth-store";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import { usePreferences, useSessionHistory, useStartSession, useStats } from "@/hooks/pyq";
import { useStreakState } from "@/lib/use-streak-state";
import { PageLoading, QueryError } from "@/components/pyq/query-states";
import { greetingForHour } from "@jsmf/core/domain";

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
  const streak = useStreakState();
  const targetExamId = preferences?.targetExamId ?? profile.targetExamId;

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
      {/* The streak already appears in the topbar and in Today's progress —
          repeating it in the header too would be three times on one screen. */}
      <PageHeader title={`${greeting}, ${firstName}`} description="Ready for today's practice?" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="Overall accuracy" value={`${statistics.accuracy}%`} />
        <StatCard
          icon={ClipboardList}
          label="Questions attempted"
          value={`${statistics.attempted}/${statistics.totalQuestions}`}
        />
        <StatCard icon={XCircle} label="Wrong questions" value={statistics.wrongQuestionCount} tone="error" />
        <StatCard icon={Bookmark} label="Bookmarked" value={statistics.bookmarkCount} tone="flag" />
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
                focusAreas.map((s) => (
                  <div
                    key={s.subjectId}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
                  >
                    <SubjectBadge subjectId={s.subjectId} />
                    <span className="text-sm font-semibold text-foreground">{s.accuracy}%</span>
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
