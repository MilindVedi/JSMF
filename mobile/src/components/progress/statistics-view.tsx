import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Bookmark, ChartColumn, ChevronRight, CircleCheck, CircleX, Library } from "lucide-react-native";
import { getCollectionStats } from "@jsmf/core/domain";
import { useCollections, useStats, useTaxonomyLookup } from "@jsmf/core/hooks";
import { useColors, withAlpha } from "@/theme/theme";
import { useTabBarClearance } from "@/components/navigation/tab-bar";
import { BRAND_GRADIENT, Button, type IconComponent } from "@/components/ui/button";
import { Card, EmptyState, IconTile, Loading, PressableCard, ProgressBar, QueryError, SectionTitle, StatTile, type Tone } from "@/components/ui/primitives";
import { HeroCard, HeroText, ProgressRing } from "@/components/ui/hero";
import { BandLegend, useBandColors } from "@/components/ui/score";
import { BottomSheet } from "@/components/ui/sheet";
import { Heading, Txt } from "@/components/ui/text";
import { AccuracyTrendChart, DonutBreakdown, SubjectBars } from "@/components/charts/charts";
import { CountUp } from "@/components/motion/count-up";
import { Stagger } from "@/components/motion/rise";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";

/**
 * Performance & statistics (web's /statistics): overall accuracy, coverage of
 * the bank, accuracy per subject, the trend and the breakdown. `header` (the
 * tab's own top) scrolls with the page.
 */
export function StatisticsScroll({ header }: { header: ReactNode }) {
  const colors = useColors();
  const clearance = useTabBarClearance();
  const statsQuery = useStats();
  const collectionsQuery = useCollections();
  useRefetchOnFocus(statsQuery, collectionsQuery);
  const { data: stats, error, refetch, isRefetching } = statsQuery;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: clearance }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
    >
      {header}
      <View className="mt-4 gap-4 px-5">
        {error ? (
          <QueryError error={error} onRetry={() => void refetch()} title="Couldn't load your statistics" />
        ) : !stats ? (
          <Loading />
        ) : (
          <StatisticsBody stats={stats} collections={collectionsQuery.data ?? []} />
        )}
      </View>
    </ScrollView>
  );
}

type Stats = NonNullable<ReturnType<typeof useStats>["data"]>;
type Collections = NonNullable<ReturnType<typeof useCollections>["data"]>;

function StatisticsBody({ stats, collections }: { stats: Stats; collections: Collections }) {
  const router = useRouter();
  const { taxonomy, subject } = useTaxonomyLookup();
  const [coverageOpen, setCoverageOpen] = useState(false);
  const band = useBandColors(stats.accuracy);

  if (stats.attempted === 0) {
    return (
      <EmptyState
        icon={ChartColumn}
        title="No practice data yet"
        description="Attempt some questions to start seeing your performance statistics here."
        action={<Button label="Browse question bank" size="sm" onPress={() => router.push("/practice")} />}
      />
    );
  }

  const withAttempts = stats.bySubject.filter((s) => s.attempted > 0);
  const collectionStats = getCollectionStats(collections);
  const attemptedBySubject = new Map(stats.bySubject.map((s) => [s.subjectId, s.attempted] as const));
  const coverage = taxonomy.subjects
    .filter((s) => s.questionCount > 0)
    .map((s) => {
      const attempted = attemptedBySubject.get(s.id) ?? 0;
      return { subjectId: s.id, total: s.questionCount, attempted, coverage: Math.round((attempted / s.questionCount) * 100) };
    })
    .sort((a, b) => a.coverage - b.coverage);

  return (
    <>
      <Stagger>
        <HeroCard>
          <View className="flex-row items-center gap-4">
            {/* Accuracy is a score, so the ring takes its band's colour (never purple). */}
            <ProgressRing value={stats.accuracy} color={band.solid} track={withAlpha(BRAND_GRADIENT.onDeep, 0.2)} size={96} stroke={10} />
            <View className="flex-1">
              <CountUp value={stats.accuracy} suffix="%" font="display" weight={700} className="text-3xl leading-9" style={{ color: BRAND_GRADIENT.onDeep }} />
              <HeroText dim className="text-xs">
                overall accuracy
              </HeroText>
              <HeroText dim className="mt-2 text-xs">
                {stats.attempted} of {stats.totalQuestions} questions seen
              </HeroText>
            </View>
          </View>
        </HeroCard>

        <View className="flex-row gap-2.5">
          <StatTile label="Correct" value={stats.correct} tone="success" />
          <StatTile label="Incorrect" value={stats.incorrect} tone="error" />
          <StatTile label="Left" value={stats.unattempted} sub="never attempted" tone="card" />
        </View>

        {/* Coverage is how much is done, not a score: it stays the brand purple. */}
        <PressableCard className="gap-3" onPress={() => setCoverageOpen(true)} accessibilityLabel="Question bank coverage, by subject">
          <View className="flex-row items-center justify-between gap-3">
            <Heading className="text-[15px]">Question bank coverage</Heading>
            <Txt font="display" weight={700} className="text-lg text-primary">
              {stats.coverage}%
            </Txt>
          </View>
          <ProgressBar value={stats.coverage} />
          <Txt className="text-xs text-muted-foreground">
            {stats.attempted} attempted · {stats.unattempted} remaining · tap to see each subject
          </Txt>
        </PressableCard>

        <View>
          <SectionTitle>Subject-wise performance</SectionTitle>
          <Card className="gap-4">
            {withAttempts.length > 0 ? (
              <>
                <SubjectBars data={withAttempts} />
                <BandLegend />
              </>
            ) : (
              <Txt className="py-6 text-center text-sm text-muted-foreground">No subject data yet.</Txt>
            )}
          </Card>
        </View>

        <View>
          <SectionTitle>Accuracy over time</SectionTitle>
          <Card>
            {stats.accuracyTrend.length >= 2 ? (
              <AccuracyTrendChart data={stats.accuracyTrend} />
            ) : (
              <Txt className="py-6 text-center text-sm text-muted-foreground">Complete more tests to see your trend.</Txt>
            )}
          </Card>
        </View>

        <View>
          <SectionTitle>Correct / incorrect / unattempted</SectionTitle>
          <Card>
            <DonutBreakdown correct={stats.correct} incorrect={stats.incorrect} unattempted={stats.unattempted} />
          </Card>
        </View>

        <View className="gap-2.5">
          <LinkRow icon={CircleX} tone="error" title="Wrong questions" text={`${stats.wrongQuestionCount} question${stats.wrongQuestionCount === 1 ? "" : "s"} to revise`} href={{ pathname: "/revision", params: { section: "wrong" } }} />
          <LinkRow icon={Bookmark} tone="flag" title="Bookmarks" text={`${stats.bookmarkCount} question${stats.bookmarkCount === 1 ? "" : "s"} saved`} href="/bookmarks" />
          <LinkRow
            icon={Library}
            tone="flag"
            title="Collections"
            text={`${collectionStats.totalQuestions} question${collectionStats.totalQuestions === 1 ? "" : "s"} across ${collectionStats.collectionCount} collection${collectionStats.collectionCount === 1 ? "" : "s"}`}
            href={{ pathname: "/revision", params: { section: "collections" } }}
          />
          <LinkRow icon={CircleCheck} tone="success" title="Reinforce" text={`${stats.correct} question${stats.correct === 1 ? "" : "s"} to reinforce`} href="/reinforce" />
        </View>
      </Stagger>

      <BottomSheet
        open={coverageOpen}
        onClose={() => setCoverageOpen(false)}
        title="Question bank coverage"
        description={`${stats.coverage}% of the bank seen at least once — ${stats.attempted} attempted, ${stats.unattempted} remaining. Least-covered first.`}
      >
        <View className="gap-3.5">
          {coverage.map((s) => (
            <View key={s.subjectId} className="gap-1">
              <View className="flex-row items-center justify-between gap-2">
                <Txt weight={500} className="flex-1 text-sm" numberOfLines={1}>
                  {subject(s.subjectId)?.name ?? s.subjectId}
                </Txt>
                <Txt className="text-xs text-muted-foreground">
                  {s.attempted}/{s.total} · {s.coverage}%
                </Txt>
              </View>
              <ProgressBar value={s.coverage} />
            </View>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

function LinkRow({ icon, tone, title, text, href }: { icon: IconComponent; tone: Tone; title: string; text: string; href: Href }) {
  const router = useRouter();
  const colors = useColors();
  return (
    <PressableCard className="flex-row items-center gap-3 p-3.5" onPress={() => router.push(href)}>
      <IconTile icon={icon} tone={tone} size={36} />
      <View className="flex-1">
        <Txt weight={600} className="text-sm">
          {title}
        </Txt>
        <Txt className="text-xs text-muted-foreground">{text}</Txt>
      </View>
      <ChevronRight size={16} color={colors["muted-foreground"]} />
    </PressableCard>
  );
}
