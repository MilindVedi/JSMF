"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
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
import { ListSkeleton, QueryError } from "@/components/pyq/query-states";
import { pyqCapabilities, useQuestions, useStartSession } from "@/hooks/pyq";
import type { QuestionListItem, QuestionQuery } from "@/lib/data-source";
import {
  QUESTION_BANK_SORT_OPTIONS,
  QUESTION_SORT_LABELS,
  QUESTION_SORT_GROUPS,
  type QuestionSortOption,
} from "@/lib/question-sort";

const PAGE_SIZE = 50;
/** The most a single session can hold (backend MAX_SESSION_QUESTIONS). */
const MAX_SESSION_QUESTIONS = 200;

const QUESTION_BANK_SORT_DROPDOWN_OPTIONS = QUESTION_BANK_SORT_OPTIONS.map((value) => ({
  value,
  label: QUESTION_SORT_LABELS[value],
  group: QUESTION_SORT_GROUPS[value],
}));

function toQuery(
  filters: QuestionFiltersState,
  status: QuestionStatusFilter,
  search: string,
  sort: QuestionSortOption
): QuestionQuery {
  const pick = <T,>(list: T[]) => (list.length ? list : undefined);
  return {
    examIds: pick(filters.examIds),
    years: pick(filters.years),
    subjectIds: pick(filters.subjectIds),
    topicIds: pick(filters.topicIds),
    collectionIds: pyqCapabilities.collections ? pick(filters.collectionIds) : undefined,
    status: status === "all" ? undefined : status,
    search: pyqCapabilities.search && search.trim() ? search.trim() : undefined,
    sort: pyqCapabilities.sort ? sort : undefined,
  };
}

export default function QuestionBankPage() {
  const [filters, setFiltersState] = useState<QuestionFiltersState>(EMPTY_QUESTION_FILTERS);
  const [status, setStatusState] = useState<QuestionStatusFilter>("all");
  const [search, setSearchState] = useState("");
  const [sort, setSort] = useState<QuestionSortOption>("newest-exam-year");
  const [page, setPage] = useState(1);
  const startSession = useStartSession();

  // Any change to what matches starts again from the first page.
  const setFilters = (next: QuestionFiltersState) => {
    setFiltersState(next);
    setPage(1);
  };
  const setStatus = (next: QuestionStatusFilter) => {
    setStatusState(next);
    setPage(1);
  };
  const setSearch = (next: string) => {
    setSearchState(next);
    setPage(1);
  };

  const query = useMemo(() => toQuery(filters, status, search, sort), [filters, status, search, sort]);
  const { data, error, isPending, isFetching, refetch } = useQuestions(query, page, PAGE_SIZE);
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;

  function practiceAll() {
    startSession({
      mode: "browse",
      label: "Question Bank",
      filters: query,
      count: Math.min(total, MAX_SESSION_QUESTIONS),
    });
  }

  function practiceFrom(question: QuestionListItem) {
    const startIndex = items.findIndex((q) => q.id === question.id);
    startSession({
      mode: "browse",
      label: "Question Bank",
      questionIds: items.map((q) => q.id),
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
        {(pyqCapabilities.search || pyqCapabilities.sort) && (
          <div className="flex items-center gap-2">
            {pyqCapabilities.search && (
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search questions"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            )}
            {pyqCapabilities.sort && (
              <SortDropdown value={sort} options={QUESTION_BANK_SORT_DROPDOWN_OPTIONS} onChange={setSort} />
            )}
          </div>
        )}
      </div>

      <ActiveFilterChips value={filters} onChange={setFilters} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isPending ? "Loading questions…" : `${total} question${total === 1 ? "" : "s"} match your filters`}
        </p>
        <Button onClick={practiceAll} disabled={total === 0 || startSession.isPending}>
          Practice these questions
        </Button>
      </div>

      {error ? (
        <QueryError error={error} onRetry={() => refetch()} title="Couldn't load questions" />
      ) : isPending ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
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
        <>
          <Card className={`p-0 transition-opacity ${isFetching ? "opacity-70" : ""}`}>
            <div className="divide-y divide-border">
              {items.map((q, i) => (
                <QuestionListRow
                  key={q.id}
                  question={q}
                  number={offset + i + 1}
                  status={q.userStatus}
                  onClick={() => practiceFrom(q)}
                />
              ))}
            </div>
          </Card>
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <p className="text-sm text-muted-foreground">
                Page {page} of {pageCount}
              </p>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
