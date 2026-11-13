"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Play,
  Search,
  SlidersHorizontal,
} from "lucide-react";
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
import type { QuestionListItem, QuestionQuery } from "@jsmf/core/data-source";
import {
  QUESTION_BANK_SORT_OPTIONS,
  QUESTION_SORT_LABELS,
  QUESTION_SORT_GROUPS,
  MAX_SESSION_QUESTIONS,
  type QuestionSortOption,
} from "@jsmf/core/domain";

const PAGE_SIZE = 50;

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

  // Typing settles before it becomes a request — each keystroke is otherwise a server query.
  const [settledSearch, setSettledSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettledSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => toQuery(filters, status, settledSearch, sort),
    [filters, status, settledSearch, sort]
  );
  // While a changed filter loads, `data` is still the previous result; the
  // count and "Practice these" wait for the new one.
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useQuestions(query, page, PAGE_SIZE);
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
      {/* The page's own masthead rather than the shared PageHeader: this is
          the screen students live in, so it gets the eyebrow, the full title
          and the one claim worth making about the bank's contents. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="eyebrow">
            <BookOpen className="size-3.5" /> The practice desk
          </span>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Question Bank<span className="text-primary">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Build confidence, one clinical question at a time.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" /> Memory-based PYQs
        </span>
      </header>

      <StatusTabs value={status} onChange={setStatus} />

      {/* The filters sit in their own labelled block, so a student reads them
          as one tool rather than a row of loose controls above the list. */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontal className="size-4 text-primary" /> Refine your practice
        </h2>
        <FilterPanel value={filters} onChange={setFilters} />
        {(pyqCapabilities.search || pyqCapabilities.sort) && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {pyqCapabilities.search && (
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search clinical cases, conditions, keywords…"
                  aria-label="Search questions"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
            {pyqCapabilities.sort && (
              <SortDropdown value={sort} options={QUESTION_BANK_SORT_DROPDOWN_OPTIONS} onChange={setSort} />
            )}
          </div>
        )}
        <ActiveFilterChips value={filters} onChange={setFilters} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ListFilter className="size-4 shrink-0 text-primary" />
          {isPending ? "Loading questions…" : `${total} question${total === 1 ? "" : "s"} match your filters`}
        </p>
        <Button onClick={practiceAll} disabled={total === 0 || isPlaceholderData || startSession.isPending}>
          <Play className="size-4" />
          Practice these questions
          <ArrowRight className="size-4" />
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
