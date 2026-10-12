import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import { History as HistoryIcon } from "lucide-react-native";
import {
  SESSION_MODE_LABEL,
  SESSION_SORT_LABELS,
  buildSessionSortKeys,
  sortSessions,
  type SessionMode,
  type SessionSortKeys,
  type SessionSortOption,
} from "@jsmf/core/domain";
import { useInfiniteSessionHistory, useStats } from "@jsmf/core/hooks";
import { useColors } from "@/theme/theme";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, Loading, QueryError, StatTile } from "@/components/ui/primitives";
import { Segmented, StackHeader } from "@/components/ui/screen";
import { SortSheetButton } from "@/components/filters/filters";
import { SessionSummaryRow } from "@/components/sessions";

type ModeFilter = SessionMode | "all";
type Period = "all" | "30d" | "7d";
const PERIODS: { value: Period; label: string; days?: number }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "7d", label: "Last 7 days", days: 7 },
];
const SORT_OPTIONS = (Object.keys(SESSION_SORT_LABELS) as SessionSortOption[]).map((value) => ({ value, label: SESSION_SORT_LABELS[value] }));

/** Attempt history (web's /history): finished sessions, loading older pages as you scroll. Sorting is core's. */
export default function HistoryScreen() {
  const router = useRouter();
  const colors = useColors();
  const stats = useStats();
  const history = useInfiniteSessionHistory("submitted");
  const loaded = useMemo(() => history.data?.pages.flatMap((p) => p.items) ?? [], [history.data]);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [sort, setSort] = useState<SessionSortOption>("recently-wrong");

  const byId = useMemo(() => new Map(loaded.map((i) => [i.session.id, i] as const)), [loaded]);
  const keys = useMemo(() => {
    const map = new Map<string, SessionSortKeys>();
    for (const item of loaded) map.set(item.session.id, buildSessionSortKeys(item));
    return map;
  }, [loaded]);
  const completed = useMemo(() => loaded.filter((i) => i.submitted && i.session.completedAt).map((i) => i.session), [loaded]);
  const counts = useMemo(() => {
    const c: Record<ModeFilter, number> = { all: completed.length, browse: 0, "custom-test": 0, bookmarks: 0, "wrong-questions": 0 };
    for (const s of completed) c[s.mode] += 1;
    return c;
  }, [completed]);
  const days = PERIODS.find((p) => p.value === period)?.days;
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : null;
  const visible = sortSessions(
    completed.filter((s) => (mode === "all" || s.mode === mode) && (!since || s.completedAt!.slice(0, 10) >= since)),
    sort,
    keys
  );

  const error = stats.error ?? history.error;
  return (
    <View className="flex-1 bg-background">
      <StackHeader title="Attempt History" subtitle="Every session you've finished." />
      {error ? (
        <View className="p-5">
          <QueryError error={error} title="Couldn't load your history" onRetry={() => void history.refetch()} />
        </View>
      ) : !stats.data || !history.data ? (
        <Loading />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(s) => s.id}
          contentContainerClassName="px-5 pb-10 pt-4 gap-2"
          ListHeaderComponent={
            <View className="gap-3 pb-2">
              <View className="flex-row gap-2">
                <StatTile label="Attempted" value={stats.data.attempted} />
                <StatTile label="Correct" value={stats.data.correct} tone="success" />
                <StatTile label="Incorrect" value={stats.data.incorrect} tone="error" />
              </View>
              {completed.length > 0 ? (
                <>
                  <Segmented
                    value={mode}
                    onChange={setMode}
                    options={[{ value: "all" as ModeFilter, label: "All", count: counts.all }, ...(Object.keys(SESSION_MODE_LABEL) as SessionMode[]).map((m) => ({ value: m as ModeFilter, label: SESSION_MODE_LABEL[m], count: counts[m] }))]}
                  />
                  <View className="flex-row flex-wrap items-center gap-2">
                    {PERIODS.map((p) => (
                      <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod(p.value)} className="h-8 px-3" />
                    ))}
                    <SortSheetButton value={sort} options={SORT_OPTIONS} onChange={setSort} />
                  </View>
                </>
              ) : null}
            </View>
          }
          renderItem={({ item }) => <SessionSummaryRow item={byId.get(item.id)!} showMode />}
          ListEmptyComponent={
            completed.length === 0 ? (
              <EmptyState
                icon={HistoryIcon}
                title="No completed sessions yet"
                description="Finish a practice session from the Question Bank or a Custom Test to see it here."
                action={<Button label="Go to Question Bank" size="sm" onPress={() => router.push("/practice")} />}
              />
            ) : (
              <EmptyState icon={HistoryIcon} title="No sessions match these filters" description="Try a different session type or time period." />
            )
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
          }}
          ListFooterComponent={history.isFetchingNextPage ? <ActivityIndicator className="py-6" color={colors["muted-foreground"]} /> : null}
        />
      )}
    </View>
  );
}
