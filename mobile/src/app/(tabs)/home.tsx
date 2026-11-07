import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Circle,
  CircleCheck,
  CircleX,
  ClipboardList,
  Repeat,
  Sparkles,
  TrendingUp,
  WandSparkles,
} from "lucide-react-native";
import { greetingForHour, sessionScopeLabel, streakCheckInLine, streakEyebrow, type ExamId } from "@jsmf/core/domain";
import type { SessionListItem } from "@jsmf/core/data-source";
import { usePreferences, useSessionHistory, useStats, useTaxonomy, useTaxonomyLookup } from "@jsmf/core/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { useStartSession } from "@/lib/start-session";
import { useStreakState } from "@/lib/streak";
import { useColors, withAlpha } from "@/theme/theme";
import { BRAND_GRADIENT, Button, type IconComponent } from "@/components/ui/button";
import { Card, Loading, PressableCard, QueryError, SectionTitle } from "@/components/ui/primitives";
import { HeroCard, HeroText, ProgressRing } from "@/components/ui/hero";
import { ScoreBar, useBandColors } from "@/components/ui/score";
import { TabScreen } from "@/components/ui/screen";
import { cn, Txt } from "@/components/ui/text";
import { CountUp } from "@/components/motion/count-up";
import { StreakCard } from "@/components/streak/streak-card";
import { SessionSummaryRow } from "@/components/sessions";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";

/**
 * Dashboard (web's /dashboard): the onboarding variant for a brand-new account
 * (no session ever created), the full dashboard otherwise — the same data
 * and the same rules.
 */
export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const stats = useStats();
  // Exactly what the screen shows: the session to resume and the last four finished.
  const open = useSessionHistory(1, 1, "open");
  const finished = useSessionHistory(1, 4, "submitted");
  useRefetchOnFocus(stats, open, finished);
  const preferences = usePreferences();
  const { taxonomy, subject } = useTaxonomyLookup();
  const taxonomyQuery = useTaxonomy();
  const startSession = useStartSession();
  const streak = useStreakState();
  const firstName = (user?.name ?? "").split(" ")[0] || "there";
  // The exam the student chose — never a guess. Until preferences arrive the
  // first-run hero waits rather than showing (and starting) the wrong exam; an
  // account with no exam saved falls back to the first exam, as sign-up does.
  // `undefined` = still finding out; `null` = settled with no exam to offer
  // (the bank has no exams yet), which must read as "not yet", never a spinner.
  const prefsSettled = Boolean(preferences.data || preferences.error);
  const targetExamId: ExamId | null | undefined =
    preferences.data?.targetExamId ?? (!prefsSettled || taxonomyQuery.isPending ? undefined : (taxonomy.exams[0]?.id ?? null));
  const refreshing = stats.isRefetching || open.isRefetching || finished.isRefetching;
  const refresh = () => {
    void stats.refetch();
    void open.refetch();
    void finished.refetch();
    void preferences.refetch();
  };

  const error = stats.error ?? open.error ?? finished.error;
  const statistics = stats.data;

  if (error) {
    return (
      <TabScreen title="Dashboard">
        <QueryError error={error} title="Couldn't load your dashboard" onRetry={refresh} />
      </TabScreen>
    );
  }
  if (!statistics || !open.data || !finished.data) {
    return (
      <TabScreen title="Dashboard" scroll={false}>
        <Loading />
      </TabScreen>
    );
  }

  // No session ever created — a genuinely new account. The onboarding view
  // replaces the screen rather than a grid of zeroed-out cards.
  if (open.data.total + finished.data.total === 0) {
    return (
      <TabScreen
        eyebrow="Getting started"
        eyebrowIcon={Sparkles}
        title={`Welcome, ${firstName}`}
        subtitle="Let's get your preparation started."
        onRefresh={refresh}
        refreshing={refreshing}
      >
        <Onboarding
          targetExamId={targetExamId}
          hasBookmark={statistics.bookmarkCount > 0}
          hasStreak={streak.currentStreak > 0}
          onStart={() => {
            if (targetExamId) startSession({ mode: "browse", label: "Question Bank", filters: { examIds: [targetExamId] }, count: 10 });
          }}
          starting={startSession.isPending || targetExamId === undefined}
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
    <TabScreen
      eyebrow={streakEyebrow(streak.currentStreak)}
      eyebrowIcon={Sparkles}
      title={`${greetingForHour(new Date().getHours())}, ${firstName}`}
      subtitle={streakCheckInLine(streak)}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <NextSessionCard inProgress={inProgress} lastCompleted={recent[0]} />

      <View className="gap-2.5">
        <View className="flex-row gap-2.5">
          <StatCard icon={TrendingUp} label="Overall accuracy" value={statistics.accuracy} suffix="%" />
          <StatCard icon={ClipboardList} label="Attempted" value={statistics.attempted} />
        </View>
        <View className="flex-row gap-2.5">
          <StatCard icon={CircleX} label="Wrong questions" value={statistics.wrongQuestionCount} tone="error" />
          <StatCard icon={Bookmark} label="Bookmarked" value={statistics.bookmarkCount} />
        </View>
      </View>

      <StreakCard />

      <View>
        <SectionTitle>Your study tools</SectionTitle>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <ToolTile icon={BookOpen} label="Question Bank" description="Memory-based PYQs" href="/practice" />
            <ToolTile icon={WandSparkles} label="Custom Test" description="Build your own test" href="/custom-test" />
          </View>
          <View className="flex-row gap-3">
            <ToolTile icon={Repeat} label="Revision" description="Wrong, saved & collections" href="/revision" />
            <ToolTile
              icon={Bookmark}
              label="Bookmarks"
              description={statistics.bookmarkCount > 0 ? `${statistics.bookmarkCount} saved for later` : "Save questions for later"}
              href="/bookmarks"
            />
          </View>
        </View>
      </View>

      <View>
        <SectionTitle>Recent activity</SectionTitle>
        {recent.length === 0 ? (
          <View className="rounded-[20px] border border-dashed border-border p-4">
            <Txt className="text-sm text-muted-foreground">No completed sessions yet — finish a practice session to see it here.</Txt>
          </View>
        ) : (
          <View className="gap-2.5">
            {recent.map((item) => (
              <SessionSummaryRow key={item.session.id} item={item} />
            ))}
          </View>
        )}
      </View>

      <View>
        <SectionTitle>Focus areas</SectionTitle>
        <Card className="gap-3">
          {focusAreas.length === 0 ? (
            <Txt className="text-sm text-muted-foreground">Attempt more questions to see focus areas.</Txt>
          ) : (
            focusAreas.map((s) => <FocusRow key={s.subjectId} name={subject(s.subjectId)?.name ?? s.subjectId} accuracy={s.accuracy} />)
          )}
        </Card>
      </View>
    </TabScreen>
  );
}

/** A subject that needs work: its accuracy as a bar and a figure, both in the score's band colour. */
function FocusRow({ name, accuracy }: { name: string; accuracy: number }) {
  const { ink } = useBandColors(accuracy);
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between gap-3">
        <Txt className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
          {name}
        </Txt>
        <Txt weight={700} className="text-xs" style={{ color: ink }}>
          {accuracy}%
        </Txt>
      </View>
      <ScoreBar value={accuracy} />
    </View>
  );
}

/** A figure tile: its icon, the number counting up, what it is. Wrong questions are tinted red. */
function StatCard({ icon: Icon, label, value, suffix, tone = "plain" }: { icon: IconComponent; label: string; value: number; suffix?: string; tone?: "plain" | "error" }) {
  const colors = useColors();
  const error = tone === "error";
  return (
    <View className={cn("flex-1 rounded-2xl border p-3.5", error ? "border-error-foreground/25 bg-error/70" : "border-border bg-card")}>
      <Icon size={16} color={error ? colors["error-foreground"] : colors.primary} strokeWidth={2} />
      <CountUp value={value} suffix={suffix} font="display" weight={700} className="mt-1.5 text-xl leading-7" />
      <Txt className="text-[10px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** A shortcut to one of the study tools, on the soft lavender tile. */
function ToolTile({ icon: Icon, label, description, href }: { icon: IconComponent; label: string; description: string; href: Href }) {
  const router = useRouter();
  const colors = useColors();
  return (
    <PressableCard tone="tint" className="flex-1 gap-3 p-4" onPress={() => router.push(href)} accessibilityLabel={label}>
      <Icon size={20} color={colors.primary} strokeWidth={1.9} />
      <View>
        <Txt weight={700} className="text-sm text-brand-ink">
          {label}
        </Txt>
        <Txt className="mt-0.5 text-[11px] leading-4 text-muted-foreground" numberOfLines={2}>
          {description}
        </Txt>
      </View>
    </PressableCard>
  );
}

function useScopeLookup() {
  const lookup = useTaxonomyLookup();
  return {
    examCount: lookup.taxonomy.exams.length,
    subjectCount: lookup.taxonomy.subjects.length,
    examName: lookup.examName,
    subjectName: (id: string) => lookup.subject(id)?.name ?? id,
  };
}

/**
 * The violet card that leads the dashboard (web's ContinuePracticeCard): the
 * session in progress with how much is done, or — with none open — a nudge
 * to start, with the last session's score.
 */
function NextSessionCard({ inProgress, lastCompleted }: { inProgress?: SessionListItem; lastCompleted?: SessionListItem }) {
  const router = useRouter();
  const scope = useScopeLookup();
  const lastBand = useBandColors(lastCompleted?.accuracy ?? 0);
  const track = withAlpha(BRAND_GRADIENT.onDeep, 0.18);

  if (inProgress) {
    const answered = inProgress.attempted;
    const total = inProgress.totalQuestions;
    const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
    return (
      <HeroCard>
        <View className="flex-row items-start gap-4">
          <View className="flex-1">
            <HeroText dim weight={600} className="text-[11px] uppercase tracking-[1.2px]">
              Continue where you left off
            </HeroText>
            <HeroText font="display" weight={700} className="mt-2 text-lg leading-6">
              {answered} of {total} done.
            </HeroText>
            <HeroText dim className="mt-1 text-xs">
              Your session is waiting for you
            </HeroText>
            <Button
              label="Resume"
              variant="onHero"
              size="sm"
              iconRight={ArrowRight}
              className="mt-3.5 self-start"
              onPress={() => router.push({ pathname: "/session/[id]", params: { id: inProgress.session.id, i: String(inProgress.resumeIndex) } })}
            />
          </View>
          {/* How much is done, not a score: the ring stays the hero's light ink. */}
          <ProgressRing value={percent} color={BRAND_GRADIENT.onDeep} track={track} label={`${percent}%`} labelColor={BRAND_GRADIENT.onDeep} size={80} stroke={7} />
        </View>
        <HeroText dim className="mt-3 text-[11px]">
          {sessionScopeLabel(inProgress, scope)}
        </HeroText>
      </HeroCard>
    );
  }

  return (
    <HeroCard>
      <View className="flex-row items-start gap-4">
        <View className="flex-1">
          <HeroText dim weight={600} className="text-[11px] uppercase tracking-[1.2px]">
            Your next session
          </HeroText>
          <HeroText font="display" weight={700} className="mt-2 text-lg leading-6">
            One question closer.
          </HeroText>
          <HeroText dim className="mt-1 text-xs">
            No session in progress
          </HeroText>
          <Button label="Start practising" variant="onHero" size="sm" iconRight={ArrowRight} className="mt-3.5 self-start" onPress={() => router.push("/practice")} />
        </View>
        {/* The last session's score — a score, so its band's colour. */}
        {lastCompleted ? (
          <ProgressRing value={lastCompleted.accuracy} color={lastBand.solid} track={track} label={`${lastCompleted.accuracy}%`} labelColor={BRAND_GRADIENT.onDeep} size={80} stroke={7} />
        ) : null}
      </View>
      <HeroText dim className="mt-3 text-[11px]">
        {lastCompleted
          ? `Last session · ${sessionScopeLabel(lastCompleted, scope)} · ${lastCompleted.accuracy}% accuracy`
          : "Start practising from the Question Bank or build a Custom Test."}
      </HeroText>
    </HeroCard>
  );
}

const HOW_IT_WORKS: { icon: IconComponent; text: string }[] = [
  { icon: BookOpen, text: "Practice recall-based PYQs" },
  { icon: Sparkles, text: "Learn from explanations" },
  { icon: TrendingUp, text: "Track weak areas" },
  { icon: Repeat, text: "Revise what you got wrong" },
];

/** The first-run dashboard (web's OnboardingDashboard): what to do next within a few seconds. */
function Onboarding({
  targetExamId,
  hasBookmark,
  hasStreak,
  onStart,
  starting,
}: {
  /** `undefined` while loading; `null` when the bank has no exam to offer yet. */
  targetExamId: ExamId | null | undefined;
  hasBookmark: boolean;
  hasStreak: boolean;
  onStart: () => void;
  starting: boolean;
}) {
  const { examName } = useTaxonomyLookup();
  const colors = useColors();
  const checklist = [
    { label: "Choose your exam", done: true },
    { label: "Complete your first practice session", done: false },
    { label: "Build your first streak", done: hasStreak },
    { label: "Bookmark a question for revision", done: hasBookmark },
  ];
  // One block inside the page's staggered body, so it spaces its own parts like the page does.
  return (
    <View className="gap-4">
      <HeroCard>
        <HeroText dim weight={600} className="text-[11px] uppercase tracking-[1.2px]">
          Your selected exam
        </HeroText>
        <HeroText font="display" weight={700} className="mt-1.5 text-[26px] leading-8">
          {targetExamId ? examName(targetExamId) : targetExamId === null ? "Not available yet" : "…"}
        </HeroText>
        <Button
          label="Start your first practice"
          variant="onHero"
          iconRight={ArrowRight}
          size="lg"
          className="mt-4"
          loading={starting}
          disabled={targetExamId === null}
          onPress={onStart}
        />
        {targetExamId === null ? (
          <HeroText dim className="mt-2.5 text-center text-xs">
            Questions are being added. Please check back soon.
          </HeroText>
        ) : null}
      </HeroCard>
      <StreakCard />
      <View>
        <SectionTitle>Or explore on your own</SectionTitle>
        <View className="flex-row gap-3">
          <ToolTile icon={BookOpen} label="Question Bank" description="Browse PYQs by subject, year & topic." href="/practice" />
          <ToolTile icon={WandSparkles} label="Custom Test" description="Build a test around your own preferences." href="/custom-test" />
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
    </View>
  );
}
