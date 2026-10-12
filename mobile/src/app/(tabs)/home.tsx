import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  ClipboardList,
  CornerDownLeft,
  Repeat,
  Sparkles,
  TrendingUp,
} from "lucide-react-native";
import { greetingForHour, sessionScopeLabel } from "@jsmf/core/domain";
import type { SessionListItem } from "@jsmf/core/data-source";
import { usePreferences, useSessionHistory, useStats, useTaxonomyLookup } from "@jsmf/core/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { useStartSession } from "@/lib/start-session";
import { useStreakState } from "@/lib/streak";
import { useColors } from "@/theme/theme";
import { Button, type IconComponent } from "@/components/ui/button";
import { Card, IconTile, Loading, PressableCard, ProgressBar, QueryError, SectionTitle, type Tone } from "@/components/ui/primitives";
import { TabScreen } from "@/components/ui/screen";
import { Eyebrow, Heading, Txt } from "@/components/ui/text";
import { StreakCard } from "@/components/streak/streak-card";
import { SubjectBadge } from "@/components/question/badges";
import { SessionSummaryRow } from "@/components/sessions";

/**
 * Home (web's /dashboard): the onboarding variant for a brand-new account
 * (no session ever created), the full dashboard otherwise — the same data
 * and the same rules.
 */
export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const stats = useStats();
  // Exactly what the screen shows: the session to resume and the last four finished.
  const open = useSessionHistory(1, 1, "open");
  const finished = useSessionHistory(1, 4, "submitted");
  const { data: preferences } = usePreferences();
  const startSession = useStartSession();
  const streak = useStreakState();
  const firstName = (user?.name ?? "").split(" ")[0] || "there";
  const targetExamId = preferences?.targetExamId ?? "neet-pg";
  const refreshing = stats.isRefetching || open.isRefetching || finished.isRefetching;
  const refresh = () => {
    void stats.refetch();
    void open.refetch();
    void finished.refetch();
  };

  const error = stats.error ?? open.error ?? finished.error;
  const statistics = stats.data;

  if (error) {
    return (
      <TabScreen title="Home">
        <QueryError error={error} title="Couldn't load your dashboard" onRetry={refresh} />
      </TabScreen>
    );
  }
  if (!statistics || !open.data || !finished.data) {
    return (
      <TabScreen title="Home" scroll={false}>
        <Loading />
      </TabScreen>
    );
  }

  // No session ever created — a genuinely new account. The onboarding view
  // replaces the screen rather than a grid of zeroed-out cards.
  if (open.data.total + finished.data.total === 0) {
    return (
      <TabScreen title={`Welcome, ${firstName}`} subtitle="Let's get your preparation started." onRefresh={refresh} refreshing={refreshing}>
        <Onboarding
          targetExamId={targetExamId}
          hasBookmark={statistics.bookmarkCount > 0}
          hasStreak={streak.currentStreak > 0}
          onStart={() => startSession({ mode: "browse", label: "Question Bank", filters: { examIds: [targetExamId] }, count: 10 })}
          starting={startSession.isPending}
        />
      </TabScreen>
    );
  }

  const inProgress = open.data.items[0];
  const recent = finished.data.items;
  const focusAreas = statistics.bySubject
    .filter((s) => s.attempted > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  return (
    <TabScreen title={`${greetingForHour(new Date().getHours())}, ${firstName}`} subtitle="Ready for today's practice?" onRefresh={refresh} refreshing={refreshing}>
      <View className="flex-row gap-3">
        <StatCard icon={TrendingUp} label="Overall accuracy" value={`${statistics.accuracy}%`} />
        <StatCard icon={ClipboardList} label="Attempted" value={`${statistics.attempted}/${statistics.totalQuestions}`} />
      </View>
      <View className="-mt-1 flex-row gap-3">
        <StatCard icon={CircleX} label="Wrong questions" value={statistics.wrongQuestionCount} tone="error" />
        <StatCard icon={Bookmark} label="Bookmarked" value={statistics.bookmarkCount} tone="flag" />
      </View>

      <ContinueCard inProgress={inProgress} lastCompleted={recent[0]} />
      <StreakCard />

      <View>
        <SectionTitle>Quick actions</SectionTitle>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <QuickAction icon={BookOpen} label="Question Bank" description="Browse and practise PYQs by subject, topic and year." href="/practice" />
            <QuickAction icon={Sparkles} label="Custom Test" description="Build a tailored test with your own filters." href="/custom-test" />
          </View>
          <View className="flex-row gap-3">
            <QuickAction icon={Repeat} label="Revision" description="Revisit what you got wrong and what you saved." href="/revision" />
            <QuickAction icon={Bookmark} label="Bookmarks" description="Questions you've saved for later." href="/bookmarks" />
          </View>
        </View>
      </View>

      <View>
        <SectionTitle>Recent activity</SectionTitle>
        {recent.length === 0 ? (
          <View className="rounded-2xl border border-dashed border-border p-4">
            <Txt className="text-sm text-muted-foreground">No completed sessions yet — finish a practice session to see it here.</Txt>
          </View>
        ) : (
          <View className="gap-2">
            {recent.map((item) => (
              <SessionSummaryRow key={item.session.id} item={item} />
            ))}
          </View>
        )}
      </View>

      <View>
        <SectionTitle>Focus areas</SectionTitle>
        <Card className="gap-2 p-3">
          {focusAreas.length === 0 ? (
            <Txt className="p-1 text-sm text-muted-foreground">Attempt more questions to see focus areas.</Txt>
          ) : (
            focusAreas.map((s) => (
              <View key={s.subjectId} className="flex-row items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                <SubjectBadge subjectId={s.subjectId} />
                <Txt weight={700} className="text-sm">
                  {s.accuracy}%
                </Txt>
              </View>
            ))
          )}
        </Card>
      </View>
    </TabScreen>
  );
}

function StatCard({ icon, label, value, tone = "muted" }: { icon: IconComponent; label: string; value: string | number; tone?: Tone }) {
  return (
    <Card className="flex-1 flex-row items-center gap-3 p-3.5">
      <IconTile icon={icon} tone={tone} />
      <View className="flex-1">
        <Txt font="display" weight={600} className="text-lg leading-6" numberOfLines={1}>
          {value}
        </Txt>
        <Txt className="text-xs leading-4 text-muted-foreground" numberOfLines={2}>
          {label}
        </Txt>
      </View>
    </Card>
  );
}

function QuickAction({ icon, label, description, href }: { icon: IconComponent; label: string; description: string; href: Href }) {
  const router = useRouter();
  const colors = useColors();
  return (
    <PressableCard className="flex-1 gap-3 p-3.5" onPress={() => router.push(href)} accessibilityLabel={label}>
      <View className="flex-row items-center justify-between">
        <IconTile icon={icon} tone="primary" size={36} />
        <CornerDownLeft size={15} color={colors.border} />
      </View>
      <View>
        <Txt font="display" weight={600} className="text-sm">
          {label}
        </Txt>
        <Txt className="mt-0.5 text-xs leading-4 text-muted-foreground">{description}</Txt>
      </View>
    </PressableCard>
  );
}

function useScopeLookup() {
  const lookup = useTaxonomyLookup();
  return {
    examCount: lookup.taxonomy.exams.length,
    subjectCount: lookup.taxonomy.subjects.length,
    examName: (id: string) => lookup.exam(id)?.shortName ?? id,
    subjectName: (id: string) => lookup.subject(id)?.name ?? id,
  };
}

/** "Continue where you left off", or a nudge to start (web's ContinuePracticeCard). */
function ContinueCard({ inProgress, lastCompleted }: { inProgress?: SessionListItem; lastCompleted?: SessionListItem }) {
  const router = useRouter();
  const scope = useScopeLookup();
  if (inProgress) {
    const answered = inProgress.attempted;
    const total = inProgress.totalQuestions;
    const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
    return (
      <Card className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Eyebrow>Continue where you left off</Eyebrow>
            <Txt font="display" weight={600} className="mt-1 text-2xl">
              {answered} <Txt className="text-base text-muted-foreground">/ {total} completed</Txt>
            </Txt>
          </View>
          <Button
            label="Resume"
            iconRight={ChevronRight}
            onPress={() => router.push({ pathname: "/session/[id]", params: { id: inProgress.session.id, i: String(inProgress.resumeIndex) } })}
          />
        </View>
        <ProgressBar value={percent} />
        <Txt className="text-sm text-muted-foreground">{sessionScopeLabel(inProgress, scope)}</Txt>
      </Card>
    );
  }
  return (
    <Card className="gap-3">
      <View>
        <Eyebrow>Start practising</Eyebrow>
        <Heading className="mt-1 text-lg">No session in progress</Heading>
        <Txt className="mt-1 text-sm text-muted-foreground">
          {lastCompleted
            ? `Last session: ${sessionScopeLabel(lastCompleted, scope)} · ${lastCompleted.accuracy}% accuracy`
            : "Start practising from the Question Bank or build a Custom Test."}
        </Txt>
      </View>
      <View className="flex-row gap-2">
        <Button label="Question Bank" size="sm" onPress={() => router.push("/practice")} />
        <Button label="Custom Test" size="sm" variant="outline" onPress={() => router.push("/custom-test")} />
      </View>
    </Card>
  );
}

const HOW_IT_WORKS: { icon: IconComponent; text: string }[] = [
  { icon: BookOpen, text: "Practice recall-based PYQs" },
  { icon: Sparkles, text: "Learn from explanations" },
  { icon: TrendingUp, text: "Track weak areas" },
  { icon: Repeat, text: "Revise what you got wrong" },
];

/** The first-run home (web's OnboardingDashboard): what to do next within a few seconds. */
function Onboarding({
  targetExamId,
  hasBookmark,
  hasStreak,
  onStart,
  starting,
}: {
  targetExamId: string;
  hasBookmark: boolean;
  hasStreak: boolean;
  onStart: () => void;
  starting: boolean;
}) {
  const { exam } = useTaxonomyLookup();
  const colors = useColors();
  const checklist = [
    { label: "Choose your exam", done: true },
    { label: "Complete your first practice session", done: false },
    { label: "Build your first streak", done: hasStreak },
    { label: "Bookmark a question for revision", done: hasBookmark },
  ];
  return (
    <>
      <Card className="gap-4">
        <View className="rounded-xl border border-border bg-muted/40 p-4">
          <Eyebrow>Your selected exam</Eyebrow>
          <Txt font="display" weight={600} className="mt-1 text-2xl">
            {exam(targetExamId)?.shortName ?? targetExamId}
          </Txt>
        </View>
        <Button label="Start your first practice" iconRight={ArrowRight} size="lg" loading={starting} onPress={onStart} />
      </Card>
      <StreakCard />
      <View>
        <SectionTitle>Or explore on your own</SectionTitle>
        <View className="flex-row gap-3">
          <QuickAction icon={BookOpen} label="Question Bank" description="Browse PYQs by subject, year & topic." href="/practice" />
          <QuickAction icon={Sparkles} label="Custom Test" description="Build a test around your own preferences." href="/custom-test" />
        </View>
      </View>
      <View>
        <SectionTitle>Getting started</SectionTitle>
        <Card className="gap-3">
          {checklist.map((item) => (
            <View key={item.label} className="flex-row items-center gap-2.5">
              {item.done ? <CircleCheck size={17} color={colors.primary} /> : <Circle size={17} color={colors.border} />}
              <Txt className={item.done ? "text-sm" : "text-sm text-muted-foreground"}>{item.label}</Txt>
            </View>
          ))}
        </Card>
      </View>
      <View>
        <SectionTitle>How JSMF works</SectionTitle>
        <Card className="gap-3">
          {HOW_IT_WORKS.map(({ icon: Icon, text }) => (
            <View key={text} className="flex-row items-center gap-2.5">
              <Icon size={16} color={colors["muted-foreground"]} strokeWidth={1.75} />
              <Txt className="text-sm text-muted-foreground">{text}</Txt>
            </View>
          ))}
        </Card>
      </View>
    </>
  );
}
