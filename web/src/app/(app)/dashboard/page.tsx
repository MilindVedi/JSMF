"use client";

import { useMemo } from "react";
import {
  BookOpen,
  Bookmark,
  ClipboardList,
  Loader2,
  Repeat,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SubjectBadge } from "@/components/common/subject-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { QuickActionCard } from "@/components/dashboard/quick-action-card";
import { TodayProgressCard } from "@/components/dashboard/today-progress-card";
import { ContinuePracticeCard } from "@/components/dashboard/continue-practice-card";
import { TestSummaryCard } from "@/components/history/test-summary-card";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { useAuthStore } from "@/store/auth-store";
import { QUESTIONS } from "@/data/mock/questions";
import { getSessionSummary, getStatistics } from "@/lib/selectors";
import { useClientSnapshot } from "@/lib/use-client-snapshot";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const hasHydratedPractice = usePracticeStore((s) => s.hasHydrated);
  const hasHydratedBookmarks = useBookmarksStore((s) => s.hasHydrated);
  const hasHydratedAuth = useAuthStore((s) => s.hasHydrated);
  const sessions = usePracticeStore((s) => s.sessions);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const profile = useAuthStore((s) => s.profile);

  const hasHydrated = hasHydratedPractice && hasHydratedBookmarks && hasHydratedAuth;

  const greeting = useClientSnapshot(() => greetingForHour(new Date().getHours()), "Welcome back");

  const statistics = useMemo(
    () => (hasHydrated ? getStatistics(Object.values(sessions), QUESTIONS, bookmarks) : null),
    [hasHydrated, sessions, bookmarks]
  );

  const sessionList = useMemo(() => (hasHydrated ? Object.values(sessions) : []), [hasHydrated, sessions]);

  if (!hasHydrated || !statistics) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const inProgress = sessionList.find((s) => !s.completedAt);
  const completedByRecency = sessionList
    .filter((s) => s.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  const recentSessions = completedByRecency.slice(0, 4);
  const focusAreas = statistics.bySubject
    .filter((s) => s.attempted > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  const firstName = profile.name.split(" ")[0];

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ContinuePracticeCard
            inProgress={inProgress}
            lastCompleted={completedByRecency[0]}
            questions={QUESTIONS}
          />
        </div>
        <TodayProgressCard sessions={sessionList} streakDays={profile.streakDays} />
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
              {recentSessions.map((session) => {
                const summary = getSessionSummary(session, QUESTIONS);
                return (
                  <TestSummaryCard
                    key={session.id}
                    session={session}
                    accuracy={summary.accuracy}
                    correct={summary.correct}
                    incorrect={summary.incorrect}
                  />
                );
              })}
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
