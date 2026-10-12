import { useState } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChartColumn, Bookmark, ChevronRight, CircleCheck, CircleX, History, Library } from "lucide-react-native";
import { getCollectionStats } from "@jsmf/core/domain";
import { useCollections, useStats, useTaxonomyLookup } from "@jsmf/core/hooks";
import { useColors } from "@/theme/theme";
import { Button, type IconComponent } from "@/components/ui/button";
import { Card, EmptyState, IconTile, Loading, PressableCard, ProgressBar, QueryError, StatTile, type Tone } from "@/components/ui/primitives";
import { BottomSheet } from "@/components/ui/sheet";
import { TabScreen } from "@/components/ui/screen";
import { Heading, Txt } from "@/components/ui/text";
import { AccuracyTrendChart, DonutBreakdown, SubjectBars } from "@/components/charts/charts";

/** Performance & statistics (web's /statistics): overview, coverage, per subject, accuracy trend. */
export default function StatsScreen() {
  const router = useRouter();
  const { data: stats, error, refetch, isRefetching } = useStats();
  const { data: collections = [] } = useCollections();
  const { taxonomy, subject } = useTaxonomyLookup();
  const [coverageOpen, setCoverageOpen] = useState(false);

  if (error) {
    return (
      <TabScreen title="Statistics">
        <QueryError error={error} onRetry={() => void refetch()} title="Couldn't load your statistics" />
      </TabScreen>
    );
  }
  if (!stats) {
    return (
      <TabScreen title="Statistics" scroll={false}>
        <Loading />
      </TabScreen>
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
    <TabScreen title="Statistics" subtitle="Accuracy, subject strengths and progress over time." onRefresh={() => void refetch()} refreshing={isRefetching}>
      {stats.attempted === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="No practice data yet"
          description="Attempt some questions to start seeing your performance statistics here."
          action={<Button label="Browse question bank" size="sm" onPress={() => router.push("/practice")} />}
        />
      ) : (
        <>
          <View className="flex-row gap-2.5">
            <StatTile label="Overall accuracy" value={`${stats.accuracy}%`} tone="card" />
            <StatTile label="Attempted" value={stats.attempted} sub={`of ${stats.totalQuestions} questions`} tone="card" />
          </View>
          <View className="-mt-1.5 flex-row gap-2.5">
            <StatTile label="Correct" value={stats.correct} tone="success" />
            <StatTile label="Incorrect" value={stats.incorrect} tone="error" />
            <StatTile label="Remaining" value={stats.unattempted} sub="never attempted" />
          </View>

          <PressableCard className="gap-3" onPress={() => setCoverageOpen(true)} accessibilityLabel="Question bank coverage, by subject">
            <Heading className="text-base">Question bank coverage</Heading>
            <Txt font="display" weight={600} className="text-2xl">
              {stats.coverage}% <Txt className="text-sm text-muted-foreground">of the bank seen at least once</Txt>
            </Txt>
            <ProgressBar value={stats.coverage} />
            <Txt className="text-xs text-muted-foreground">
              {stats.attempted} attempted · {stats.unattempted} remaining. Accuracy tells you how well you answer; coverage tells you how much of the bank you&apos;ve worked through. Tap for each subject.
            </Txt>
          </PressableCard>

          <Card className="gap-4">
            <Heading className="text-base">Subject-wise performance</Heading>
            {withAttempts.length > 0 ? <SubjectBars data={withAttempts} /> : <Txt className="py-6 text-center text-sm text-muted-foreground">No subject data yet.</Txt>}
          </Card>

          <Card className="gap-4">
            <Heading className="text-base">Correct / incorrect / unattempted</Heading>
            <DonutBreakdown correct={stats.correct} incorrect={stats.incorrect} unattempted={stats.unattempted} />
          </Card>

          <Card className="gap-3">
            <Heading className="text-base">Accuracy over time</Heading>
            {stats.accuracyTrend.length >= 2 ? (
              <AccuracyTrendChart data={stats.accuracyTrend} />
            ) : (
              <Txt className="py-6 text-center text-sm text-muted-foreground">Complete more tests to see your trend.</Txt>
            )}
          </Card>

          <View className="gap-2.5">
            <LinkRow icon={CircleX} tone="error" title="Wrong questions" text={`${stats.wrongQuestionCount} question${stats.wrongQuestionCount === 1 ? "" : "s"} to revise`} href="/revision" />
            <LinkRow icon={Bookmark} tone="flag" title="Bookmarks" text={`${stats.bookmarkCount} question${stats.bookmarkCount === 1 ? "" : "s"} saved`} href="/bookmarks" />
            <LinkRow
              icon={Library}
              tone="flag"
              title="Collections"
              text={`${collectionStats.totalQuestions} question${collectionStats.totalQuestions === 1 ? "" : "s"} across ${collectionStats.collectionCount} collection${collectionStats.collectionCount === 1 ? "" : "s"}`}
              href="/revision"
            />
            <LinkRow icon={CircleCheck} tone="success" title="Reinforce" text={`${stats.correct} question${stats.correct === 1 ? "" : "s"} to reinforce`} href="/revision" />
            <LinkRow icon={History} tone="muted" title="Attempt history" text="Every session you've finished" href="/history" />
          </View>
        </>
      )}

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
    </TabScreen>
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
