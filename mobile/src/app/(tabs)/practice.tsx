import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { BookOpen, Search } from "lucide-react-native";
import {
  MAX_SESSION_QUESTIONS,
  QUESTION_BANK_SORT_OPTIONS,
  QUESTION_SORT_GROUPS,
  QUESTION_SORT_LABELS,
  type QuestionSortOption,
} from "@jsmf/core/domain";
import type { QuestionListItem, QuestionQuery } from "@jsmf/core/data-source";
import { useInfiniteQuestions } from "@jsmf/core/hooks";
import { useStartSession } from "@/lib/start-session";
import { useColors } from "@/theme/theme";
import { useTabBarClearance } from "@/components/navigation/tab-bar";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/field";
import { EmptyState, QueryError } from "@/components/ui/primitives";
import { Segmented, TabHeader } from "@/components/ui/screen";
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
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";

type StatusFilter = "all" | "unattempted" | "incorrect" | "bookmarked";
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Questions" },
  { value: "unattempted", label: "Unattempted" },
  { value: "incorrect", label: "Incorrect" },
  { value: "bookmarked", label: "Bookmarked" },
];
const SORT_OPTIONS = QUESTION_BANK_SORT_OPTIONS.map((value) => ({
  value,
  label: QUESTION_SORT_LABELS[value],
  group: QUESTION_SORT_GROUPS[value],
}));
const PAGE_SIZE = 50;

/**
 * The question bank (web's /question-bank): the same filters, status tabs,
 * debounced search and sort, as one list that loads more as you scroll. The
 * tab's header scrolls away with it.
 */
export default function PracticeScreen() {
  const colors = useColors();
  const clearance = useTabBarClearance();
  const startSession = useStartSession();
  const [filters, setFilters] = useState<QuestionFiltersState>(
    EMPTY_QUESTION_FILTERS,
  );
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
    [filters, status, settledSearch, sort],
  );
  const list = useInfiniteQuestions(query, PAGE_SIZE);
  // Statuses and the Unattempted / Incorrect / Bookmarked tabs change during practice.
  useRefetchOnFocus(list);
  const items = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;

  function practiceAll() {
    startSession({
      mode: "browse",
      label: "Question Bank",
      filters: query,
      count: Math.min(total, MAX_SESSION_QUESTIONS),
    });
  }

  const practiceFrom = useCallback(
    (question: QuestionListItem) => {
      // The loaded questions, around the one tapped, capped at a session's maximum.
      const index = items.findIndex((q) => q.id === question.id);
      const start = Math.max(
        0,
        Math.min(
          index - Math.floor(MAX_SESSION_QUESTIONS / 2),
          items.length - MAX_SESSION_QUESTIONS,
        ),
      );
      const slice = items.slice(start, start + MAX_SESSION_QUESTIONS);
      startSession({
        mode: "browse",
        label: "Question Bank",
        questionIds: slice.map((q) => q.id),
        startIndex: Math.max(index - start, 0),
      });
    },
    [items, startSession],
  );

  const header = (
    <View className="gap-3 pb-3">
      <TabHeader
        eyebrow="Memory-based PYQs"
        eyebrowIcon={BookOpen}
        title="Question bank"
        subtitle="Search, bookmark and solve — one tap at a time."
        className="-mx-5 mb-1"
      />
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search topic or keyword"
      />
      <Segmented value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <FilterBar value={filters} onChange={setFilters} />
        </View>
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <ActiveFilterChips value={filters} onChange={setFilters} />
      </View>
      {/* Wraps: with large text the sort button drops under the count instead of squeezing it. */}
      <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Txt className="shrink grow basis-40 text-sm text-muted-foreground">
          {list.isPending
            ? "Loading questions…"
            : `${total} question${total === 1 ? "" : "s"} match your filters`}
        </Txt>
        <SortSheetButton
          value={sort}
          options={SORT_OPTIONS}
          onChange={setSort}
        />
      </View>
      <Button
        label="Practice these questions"
        // While a changed filter loads, the old count is still on screen.
        disabled={total === 0 || list.isPlaceholderData || startSession.isPending}
        loading={startSession.isPending}
        onPress={practiceAll}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        // A failed "load more" keeps what is already loaded (web's pager keeps
        // its place); only a first-page failure replaces the list.
        data={list.error && items.length === 0 ? [] : items}
        keyExtractor={(q) => q.id}
        contentContainerStyle={{ paddingBottom: clearance }}
        ListHeaderComponent={<View className="px-5">{header}</View>}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <View className="mb-3 px-5">
            <QuestionRow
              question={item}
              number={index + 1}
              status={item.userStatus}
              onPress={() => practiceFrom(item)}
            />
          </View>
        )}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          // After a failed page, the footer's button retries — scrolling doesn't loop on it.
          if (
            list.hasNextPage &&
            !list.isFetchingNextPage &&
            !list.isFetchNextPageError
          )
            void list.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View className="px-5">
            {list.error && items.length === 0 ? (
              <QueryError
                error={list.error}
                onRetry={() => void list.refetch()}
                title="Couldn't load questions"
              />
            ) : list.isPending ? (
              <ActivityIndicator
                color={colors["muted-foreground"]}
                className="py-10"
              />
            ) : (
              <EmptyState
                icon={Search}
                title="No questions match these filters"
                description={
                  status === "all"
                    ? "Try widening your exam, year, subject, or topic selection."
                    : "Nothing in this category yet — try a different status or widen your filters."
                }
              />
            )}
          </View>
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator
              color={colors["muted-foreground"]}
              className="py-6"
            />
          ) : list.isFetchNextPageError ? (
            <View className="flex-row items-center justify-between gap-3 px-5 py-4">
              <Txt className="flex-1 text-sm text-muted-foreground">
                Couldn&apos;t load more questions.
              </Txt>
              <Button
                label="Try again"
                size="sm"
                variant="outline"
                onPress={() => void list.fetchNextPage()}
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}
