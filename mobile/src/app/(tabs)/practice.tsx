import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { History, Search, Sparkles } from "lucide-react-native";
import {
  MAX_SESSION_QUESTIONS,
  QUESTION_BANK_SORT_OPTIONS,
  QUESTION_SORT_LABELS,
  type QuestionSortOption,
} from "@jsmf/core/domain";
import type { QuestionListItem, QuestionQuery } from "@jsmf/core/data-source";
import { useInfiniteQuestions } from "@jsmf/core/hooks";
import { useStartSession } from "@/lib/start-session";
import { useColors } from "@/theme/theme";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/field";
import { EmptyState, QueryError } from "@/components/ui/primitives";
import { Segmented, TabScreen } from "@/components/ui/screen";
import { Txt } from "@/components/ui/text";
import {
  ActiveFilterChips,
  EMPTY_QUESTION_FILTERS,
  FilterBar,
  filtersToQuery,
  SortSheetButton,
  type QuestionFiltersState,
} from "@/components/filters/filters";
import { QuestionRow } from "@/components/question/question-row";

type StatusFilter = "all" | "unattempted" | "incorrect" | "bookmarked";
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Questions" },
  { value: "unattempted", label: "Unattempted" },
  { value: "incorrect", label: "Incorrect" },
  { value: "bookmarked", label: "Bookmarked" },
];
const SORT_OPTIONS = QUESTION_BANK_SORT_OPTIONS.map((value) => ({ value, label: QUESTION_SORT_LABELS[value] }));
const PAGE_SIZE = 50;

/**
 * The question bank (web's /question-bank): the same filters, status tabs,
 * debounced search and sort, as one list that loads more as you scroll.
 */
export default function PracticeScreen() {
  const router = useRouter();
  const colors = useColors();
  const startSession = useStartSession();
  const [filters, setFilters] = useState<QuestionFiltersState>(EMPTY_QUESTION_FILTERS);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<QuestionSortOption>("newest-exam-year");

  // Typing settles before it becomes a request — each keystroke would otherwise be a query.
  const [settledSearch, setSettledSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettledSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo<QuestionQuery>(
    () => ({
      ...filtersToQuery(filters),
      status: status === "all" ? undefined : status,
      search: settledSearch.trim() || undefined,
      sort,
    }),
    [filters, status, settledSearch, sort]
  );
  const list = useInfiniteQuestions(query, PAGE_SIZE);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  function practiceAll() {
    startSession({ mode: "browse", label: "Question Bank", filters: query, count: Math.min(total, MAX_SESSION_QUESTIONS) });
  }

  const practiceFrom = useCallback(
    (question: QuestionListItem) => {
      // The loaded questions, around the one tapped, capped at a session's maximum.
      const index = items.findIndex((q) => q.id === question.id);
      const start = Math.max(0, Math.min(index - Math.floor(MAX_SESSION_QUESTIONS / 2), items.length - MAX_SESSION_QUESTIONS));
      const slice = items.slice(start, start + MAX_SESSION_QUESTIONS);
      startSession({ mode: "browse", label: "Question Bank", questionIds: slice.map((q) => q.id), startIndex: Math.max(index - start, 0) });
    },
    [items, startSession]
  );

  const header = (
    <View className="gap-3 pb-3">
      <View className="flex-row gap-2">
        <Button label="Custom test" icon={Sparkles} variant="secondary" size="sm" className="flex-1" onPress={() => router.push("/custom-test")} />
        <Button label="History" icon={History} variant="outline" size="sm" className="flex-1" onPress={() => router.push("/history")} />
      </View>
      <Segmented value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      <SearchField value={search} onChangeText={setSearch} />
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <FilterBar value={filters} onChange={setFilters} />
        </View>
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <ActiveFilterChips value={filters} onChange={setFilters} />
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Txt className="flex-1 text-sm text-muted-foreground">
          {list.isPending ? "Loading questions…" : `${total} question${total === 1 ? "" : "s"} match your filters`}
        </Txt>
        <SortSheetButton value={sort} options={SORT_OPTIONS} onChange={setSort} />
      </View>
      <Button label="Practice these questions" disabled={total === 0 || startSession.isPending} loading={startSession.isPending} onPress={practiceAll} />
    </View>
  );

  return (
    <TabScreen title="Question Bank" subtitle="Memory-based PYQs by exam, year, subject and topic." scroll={false}>
      <FlatList
        data={list.error ? [] : items}
        keyExtractor={(q) => q.id}
        contentContainerClassName="px-5 pb-10"
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <View className={index === 0 ? "overflow-hidden rounded-t-2xl border border-border bg-card" : "border-x border-b border-border bg-card"} style={index === items.length - 1 ? { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 } : undefined}>
            <QuestionRow question={item} number={index + 1} status={item.userStatus} onPress={() => practiceFrom(item)} />
          </View>
        )}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} tintColor={colors.primary} />}
        ListEmptyComponent={
          list.error ? (
            <QueryError error={list.error} onRetry={() => void list.refetch()} title="Couldn't load questions" />
          ) : list.isPending ? (
            <ActivityIndicator color={colors["muted-foreground"]} className="py-10" />
          ) : (
            <EmptyState
              icon={Search}
              title="No questions match these filters"
              description={status === "all" ? "Try widening your exam, year, subject, or topic selection." : "Nothing in this category yet — try a different status or widen your filters."}
            />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors["muted-foreground"]} className="py-6" /> : null}
      />
    </TabScreen>
  );
}
