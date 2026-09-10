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
import { getQuestions } from "@/lib/data/questions";
import { useStartSession } from "@/lib/use-start-session";
import { getQuestionStatusMap } from "@/lib/selectors";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import type { Question } from "@/types";

export default function QuestionBankPage() {
  const [filters, setFilters] = useState<QuestionFiltersState>(EMPTY_QUESTION_FILTERS);
  const [status, setStatus] = useState<QuestionStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const startSession = useStartSession();

  const sessions = usePracticeStore((s) => s.sessions);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);

  const statusMap = useMemo(() => getQuestionStatusMap(Object.values(sessions)), [sessions]);
  const bookmarkedIds = useMemo(() => new Set(bookmarks.map((b) => b.questionId)), [bookmarks]);

  const visible = useMemo(() => {
    if (status === "all") return results;
    return results.filter((q) => {
      if (status === "bookmarked") return bookmarkedIds.has(q.id);
      const current = statusMap.get(q.id) ?? "unattempted";
      return current === status;
    });
  }, [results, status, statusMap, bookmarkedIds]);

  useEffect(() => {
    let active = true;
    getQuestions({
      examIds: filters.examId === "all" ? undefined : [filters.examId],
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
        examIds: filters.examId === "all" ? undefined : [filters.examId],
        years: filters.years.length ? filters.years : undefined,
        subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
        topicIds: filters.topicIds.length ? filters.topicIds : undefined,
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
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search questions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
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
            {visible.slice(0, 100).map((q) => (
              <QuestionListRow
                key={q.id}
                question={q}
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
