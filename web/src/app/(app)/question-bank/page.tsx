"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import {
  EMPTY_QUESTION_FILTERS,
  FilterPanel,
  type QuestionFiltersState,
} from "@/components/question-bank/filter-panel";
import { ActiveFilterChips } from "@/components/question-bank/active-filter-chips";
import { QuestionListRow } from "@/components/question-bank/question-list-row";
import {
  StatusTabs,
  type QuestionStatusFilter,
} from "@/components/question-bank/status-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { SortDropdown } from "@/components/common/sort-dropdown";
import { getQuestions } from "@/lib/data/questions";
import { useStartSession } from "@/lib/use-start-session";
import { getQuestionStatusMap, getQuestionsInCollections } from "@/lib/selectors";
import {
  QUESTION_BANK_SORT_OPTIONS,
  QUESTION_SORT_LABELS,
  QUESTION_SORT_GROUPS,
  buildQuestionSortContext,
  sortQuestions,
  type QuestionSortOption,
} from "@/lib/question-sort";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { useCollectionsStore } from "@/store/collections-store";
import { SUBJECTS } from "@/data/mock/subjects";
import type { Question } from "@/types";

const QUESTION_BANK_SORT_DROPDOWN_OPTIONS = QUESTION_BANK_SORT_OPTIONS.map((value) => ({
  value,
  label: QUESTION_SORT_LABELS[value],
  group: QUESTION_SORT_GROUPS[value],
}));

export default function QuestionBankPage() {
  const [filters, setFilters] = useState<QuestionFiltersState>(EMPTY_QUESTION_FILTERS);
  const [status, setStatus] = useState<QuestionStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const [sort, setSort] = useState<QuestionSortOption>("newest-exam-year");
  const startSession = useStartSession();

  const sessions = usePracticeStore((s) => s.sessions);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const collections = useCollectionsStore((s) => s.collections);

  const statusMap = useMemo(() => getQuestionStatusMap(Object.values(sessions)), [sessions]);
  const bookmarkedIds = useMemo(() => new Set(bookmarks.map((b) => b.questionId)), [bookmarks]);
  const sortContext = useMemo(
    () => buildQuestionSortContext(Object.values(sessions), bookmarks, collections, SUBJECTS),
    [sessions, bookmarks, collections]
  );

  const collectionFiltered = useMemo(
    () => getQuestionsInCollections(collections, filters.collectionIds, results),
    [collections, filters.collectionIds, results]
  );

  const statusFiltered = useMemo(() => {
    if (status === "all") return collectionFiltered;
    return collectionFiltered.filter((q) => {
      if (status === "bookmarked") return bookmarkedIds.has(q.id);
      const current = statusMap.get(q.id) ?? "unattempted";
      return current === status;
    });
  }, [collectionFiltered, status, statusMap, bookmarkedIds]);

  const visible = useMemo(
    () => sortQuestions(statusFiltered, sort, sortContext),
    [statusFiltered, sort, sortContext]
  );

  useEffect(() => {
    let active = true;
    getQuestions({
      examIds: filters.examIds.length ? filters.examIds : undefined,
      years: filters.years.length ? filters.years : undefined,
      subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
      topicIds: filters.topicIds.length ? filters.topicIds : undefined,
      search,
    }).then((qs) => {
      if (active) setResults(qs);
    });
    return () => {
      active = false;
    };
  }, [filters, search]);

  function practiceAll() {
    startSession({
      mode: "browse",
      label: "Question Bank",
      questionIds: visible.map((q) => q.id),
      filters: {
        examIds: filters.examIds.length ? filters.examIds : undefined,
        years: filters.years.length ? filters.years : undefined,
        subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
        topicIds: filters.topicIds.length ? filters.topicIds : undefined,
        collectionIds: filters.collectionIds.length ? filters.collectionIds : undefined,
      },
    });
  }

  function practiceFrom(question: Question) {
    const startIndex = visible.findIndex((q) => q.id === question.id);
    startSession({
      mode: "browse",
      label: "Question Bank",
      questionIds: visible.map((q) => q.id),
      startIndex: Math.max(startIndex, 0),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Question Bank"
        description="Browse memory-based PYQs by exam, year, subject, and topic."
      />

      <StatusTabs value={status} onChange={setStatus} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPanel value={filters} onChange={setFilters} />
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search questions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <SortDropdown value={sort} options={QUESTION_BANK_SORT_DROPDOWN_OPTIONS} onChange={setSort} />
        </div>
      </div>

      <ActiveFilterChips value={filters} onChange={setFilters} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {visible.length} question{visible.length === 1 ? "" : "s"} match your filters
        </p>
        <Button onClick={practiceAll} disabled={visible.length === 0}>
          Practice these questions
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No questions match these filters"
          description={
            status === "all"
              ? "Try widening your exam, year, subject, or topic selection."
              : "Nothing in this category yet — try a different status or widen your filters."
          }
        />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-border">
            {visible.slice(0, 100).map((q, i) => (
              <QuestionListRow
                key={q.id}
                question={q}
                number={i + 1}
                status={statusMap.get(q.id) ?? "unattempted"}
                onClick={() => practiceFrom(q)}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
