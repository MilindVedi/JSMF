"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { FilterPanel, type QuestionFiltersState } from "@/components/question-bank/filter-panel";
import { QuestionListRow } from "@/components/question-bank/question-list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { getQuestions } from "@/lib/data/questions";
import { useStartSession } from "@/lib/use-start-session";
import type { Question } from "@/types";

const DEFAULT_FILTERS: QuestionFiltersState = {
  examId: "all",
  years: [],
  subjectIds: [],
  topicIds: [],
};

export default function QuestionBankPage() {
  const [filters, setFilters] = useState<QuestionFiltersState>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const startSession = useStartSession();

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
      questionIds: results.map((q) => q.id),
      filters: {
        examIds: filters.examId === "all" ? undefined : [filters.examId],
        years: filters.years.length ? filters.years : undefined,
        subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
        topicIds: filters.topicIds.length ? filters.topicIds : undefined,
      },
    });
  }

  function practiceFrom(question: Question) {
    const startIndex = results.findIndex((q) => q.id === question.id);
    startSession({
      mode: "browse",
      label: "Question Bank",
      questionIds: results.map((q) => q.id),
      startIndex: Math.max(startIndex, 0),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Question Bank"
        description="Browse memory-based PYQs by exam, year, subject, and topic."
      />

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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {results.length} question{results.length === 1 ? "" : "s"} match your filters
        </p>
        <Button onClick={practiceAll} disabled={results.length === 0}>
          Practice these questions
        </Button>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No questions match these filters"
          description="Try widening your exam, year, subject, or topic selection."
        />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-border">
            {results.slice(0, 100).map((q) => (
              <QuestionListRow key={q.id} question={q} onClick={() => practiceFrom(q)} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
