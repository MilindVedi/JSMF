"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { FilterPanel, type QuestionFiltersState } from "@/components/question-bank/filter-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getQuestions } from "@/lib/data/questions";
import { useStartSession } from "@/lib/use-start-session";
import { cn } from "@/lib/utils";

const DEFAULT_FILTERS: QuestionFiltersState = {
  examId: "all",
  years: [],
  subjectIds: [],
  topicIds: [],
};

const QUESTION_COUNTS = [10, 20, 30, 50];
const DURATIONS_MIN = [10, 20, 30, 45, 60];

function sample<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

export default function CustomTestBuilderPage() {
  const [filters, setFilters] = useState<QuestionFiltersState>(DEFAULT_FILTERS);
  const [count, setCount] = useState(20);
  const [timed, setTimed] = useState(false);
  const [durationMin, setDurationMin] = useState(30);
  const [availableCount, setAvailableCount] = useState(0);
  const startSession = useStartSession();

  useEffect(() => {
    let active = true;
    getQuestions({
      examIds: filters.examId === "all" ? undefined : [filters.examId],
      years: filters.years.length ? filters.years : undefined,
      subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
      topicIds: filters.topicIds.length ? filters.topicIds : undefined,
    }).then((qs) => {
      if (active) setAvailableCount(qs.length);
    });
    return () => {
      active = false;
    };
  }, [filters]);

  async function handleStart() {
    const pool = await getQuestions({
      examIds: filters.examId === "all" ? undefined : [filters.examId],
      years: filters.years.length ? filters.years : undefined,
      subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
      topicIds: filters.topicIds.length ? filters.topicIds : undefined,
    });
    const selected = sample(pool, Math.min(count, pool.length));
    startSession({
      mode: "custom-test",
      label: "Custom Test",
      questionIds: selected.map((q) => q.id),
      filters: {
        examIds: filters.examId === "all" ? undefined : [filters.examId],
        years: filters.years.length ? filters.years : undefined,
        subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
        topicIds: filters.topicIds.length ? filters.topicIds : undefined,
      },
      timed,
      durationSec: timed ? durationMin * 60 : undefined,
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Build a Custom Test"
        description="Choose your filters, pick how many questions, and start practicing."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Leave a filter empty to include everything.</CardDescription>
        </CardHeader>
        <CardContent>
          <FilterPanel value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Number of questions</CardTitle>
          <CardDescription>{availableCount} questions available with the current filters.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                count === n
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              )}
            >
              {n}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Timed test</CardTitle>
            <CardDescription>Practice under real exam time pressure.</CardDescription>
          </div>
          <Switch checked={timed} onCheckedChange={setTimed} />
        </CardHeader>
        {timed && (
          <CardContent className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Duration</Label>
            {DURATIONS_MIN.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDurationMin(m)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  durationMin === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
              >
                {m} min
              </button>
            ))}
          </CardContent>
        )}
      </Card>

      <Button size="lg" className="w-full" onClick={handleStart} disabled={availableCount === 0}>
        <Sparkles />
        Start test ({Math.min(count, availableCount)} questions)
      </Button>
    </div>
  );
}
