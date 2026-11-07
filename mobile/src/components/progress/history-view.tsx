import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import { History as HistoryIcon } from "lucide-react-native";
import {
  SESSION_MODE_LABEL,
  SESSION_SORT_GROUPS,
  SESSION_SORT_LABELS,
  buildSessionSortKeys,
  sortSessions,
  type SessionMode,
  type SessionSortKeys,
  type SessionSortOption,
} from "@jsmf/core/domain";
import { useCollections, useInfiniteSessionHistory, useStats } from "@jsmf/core/hooks";
import { useColors } from "@/theme/theme";
import { useTabBarClearance } from "@/components/navigation/tab-bar";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, Loading, QueryError, StatTile } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/screen";
import { MultiSelect, SortSheetButton } from "@/components/filters/filters";
import { DateRangeField } from "@/components/filters/date-range";
import { Rise } from "@/components/motion/rise";
import { SessionSummaryRow } from "@/components/sessions";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";

/** "collections": sessions practised from one or more collections, as web's history. */
type ModeFilter = SessionMode | "all" | "collections";
type Period = "all" | "30d" | "7d" | "custom";
const PERIODS: { value: Period; label: string; days?: number }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "custom", label: "Custom range" },
];
const SORT_OPTIONS = (Object.keys(SESSION_SORT_LABELS) as SessionSortOption[]).map((value) => ({ value, label: SESSION_SORT_LABELS[value], group: SESSION_SORT_GROUPS[value] }));

/**
 * Attempt history (web's /history): the totals, then finished sessions by
 * type, period and collection, loading older pages as you scroll. Sorting is
 * core's. `header` (the tab's own top) scrolls away with the list.
 */
export function HistoryList({ header }: { header: ReactNode }) {
  const router = useRouter();
  const colors = useColors();
  const clearance = useTabBarClearance();
  const stats = useStats();
  const history = useInfiniteSessionHistory("submitted");
  const collectionsQuery = useCollections();
  const collections = collectionsQuery.data ?? [];
  useRefetchOnFocus(stats, history, collectionsQuery);
  const loaded = useMemo(() => history.data?.pages.flatMap((p) => p.items) ?? [], [history.data]);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState<SessionSortOption>("recently-wrong");
  const [collectionIds, setCollectionIds] = useState<string[]>([]);

  const byId = useMemo(() => new Map(loaded.map((i) => [i.session.id, i] as const)), [loaded]);
  const keys = useMemo(() => {
    const map = new Map<string, SessionSortKeys>();
    for (const item of loaded) map.set(item.session.id, buildSessionSortKeys(item));
    return map;
  }, [loaded]);
  const completed = useMemo(() => loaded.filter((i) => i.submitted && i.session.completedAt).map((i) => i.session), [loaded]);
  const counts = useMemo(() => {
    const c: Record<ModeFilter, number> = { all: completed.length, browse: 0, "custom-test": 0, "full-mock": 0, bookmarks: 0, "wrong-questions": 0, collections: 0 };
    for (const s of completed) {
      c[s.mode] += 1;
      if (s.filters?.collectionIds?.length) c.collections += 1;
    }
    return c;
  }, [completed]);
  // "Last 7 days" counts back from when the list was opened, not from each re-render.
  const [openedAt] = useState(() => Date.now());
  const days = PERIODS.find((p) => p.value === period)?.days;
  const since = days ? new Date(openedAt - days * 86_400_000).toISOString().slice(0, 10) : null;
  const visible = sortSessions(
    completed.filter((s) => {
      // Web's rule: "Collections" is any session drawn from a collection, whatever its mode.
      if (mode === "collections" ? !s.filters?.collectionIds?.length : mode !== "all" && s.mode !== mode) return false;
      const day = s.completedAt!.slice(0, 10);
      if (since && day < since) return false;
      // Web's custom range: either end may be left open.
      if (period === "custom" && ((customFrom && day < customFrom) || (customTo && day > customTo))) return false;
      return collectionIds.length === 0 || collectionIds.some((id) => s.filters?.collectionIds?.includes(id));
    }),
    sort,
    keys
  );

  const error = stats.error ?? history.error;
  if (error || !stats.data || !history.data) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 px-5 pt-4">
          {error ? (
            <QueryError
              error={error}
              title="Couldn't load your history"
              onRetry={() => {
                void stats.refetch();
                void history.refetch();
              }}
            />
          ) : (
            <Loading />
          )}
        </View>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={visible}
      keyExtractor={(s) => s.id}
      contentContainerClassName="gap-2.5"
      contentContainerStyle={{ paddingBottom: clearance }}
      ListHeaderComponent={
        <View className="gap-3 pb-1.5">
          {header}
          <Rise className="gap-3 px-5" delayMs={60}>
            <View className="flex-row gap-2.5">
              <StatTile label="Attempted" value={stats.data.attempted} tone="card" />
              <StatTile label="Correct" value={stats.data.correct} tone="success" />
            </View>
            <View className="flex-row gap-2.5">
              <StatTile label="Incorrect" value={stats.data.incorrect} tone="error" />
              <StatTile label="Unattempted" value={stats.data.unattempted} tone="card" />
            </View>
          </Rise>
          {completed.length > 0 ? (
            <Rise className="gap-3 px-5" delayMs={120}>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "all" as ModeFilter, label: "All", count: counts.all },
                  ...(Object.keys(SESSION_MODE_LABEL) as SessionMode[]).map((m) => ({ value: m as ModeFilter, label: SESSION_MODE_LABEL[m], count: counts[m] })),
                  ...(collections.length > 0 ? [{ value: "collections" as ModeFilter, label: "Collections", count: counts.collections }] : []),
                ]}
              />
              {mode === "collections" && collections.length > 0 ? (
                <MultiSelect
                  label="Collection"
                  allOption="All Collections"
                  options={collections.map((c) => ({ id: c.id, label: c.name }))}
                  selected={collectionIds}
                  onChange={setCollectionIds}
                  triggerLabel={
                    collectionIds.length === 0 || collectionIds.length >= collections.length
                      ? "All Collections"
                      : collectionIds.length === 1
                        ? (collections.find((c) => c.id === collectionIds[0])?.name ?? "Collection")
                        : `${collectionIds.length} Collections`
                  }
                />
              ) : null}
              <View className="flex-row flex-wrap items-center gap-2">
                {PERIODS.map((p) => (
                  <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod(p.value)} />
                ))}
                <SortSheetButton value={sort} options={SORT_OPTIONS} onChange={setSort} />
              </View>
              {period === "custom" ? (
                <DateRangeField
                  from={customFrom}
                  to={customTo}
                  onChange={(from, to) => {
                    setCustomFrom(from);
                    setCustomTo(to);
                  }}
                />
              ) : null}
            </Rise>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) =>
        // Only the first screenful rises in; rows loaded further down just appear.
        index < 8 ? (
          <Rise className="px-5" delayMs={160 + index * 50}>
            <SessionSummaryRow item={byId.get(item.id)!} showMode />
          </Rise>
        ) : (
          <View className="px-5">
            <SessionSummaryRow item={byId.get(item.id)!} showMode />
          </View>
        )
      }
      ListEmptyComponent={
        <View className="px-5">
          {completed.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="No completed sessions yet"
              description="Finish a practice session from the Question Bank or a Custom Test to see it here."
              action={<Button label="Go to Question Bank" size="sm" onPress={() => router.push("/practice")} />}
            />
          ) : (
            <EmptyState icon={HistoryIcon} title="No sessions match these filters" description="Try a different session type or time period." />
          )}
        </View>
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
      }}
      ListFooterComponent={history.isFetchingNextPage ? <ActivityIndicator className="py-6" color={colors["muted-foreground"]} /> : null}
    />
  );
}
