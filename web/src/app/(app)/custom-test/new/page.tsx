"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import {
  EMPTY_QUESTION_FILTERS,
  FilterPanel,
  type QuestionFiltersState,
} from "@/components/question-bank/filter-panel";
import { ActiveFilterChips } from "@/components/question-bank/active-filter-chips";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EXAMS } from "@/data/mock/exams";
import { SUBJECTS } from "@/data/mock/subjects";
import { getQuestions } from "@/lib/data/questions";
import { getQuestionStatusMap, getQuestionsInCollections } from "@/lib/selectors";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { useCollectionsStore } from "@/store/collections-store";
import { useStartSession } from "@/lib/use-start-session";
import { cn } from "@/lib/utils";
import type { Question } from "@/types";

const QUESTION_COUNTS = [10, 20, 30, 50];
// Real exams run close to 1 minute/question (NEET-PG ~63s, FMGE ~60s,
// INI-CET ~54s), so 1x is the realistic-pace floor. 1.5x is the ceiling for
// relaxed practice — past that the timer stops meaningfully constraining
// anything, so it isn't offered.
const MIN_MIN_PER_QUESTION = 1;
const MAX_MIN_PER_QUESTION = 1.5;
const PACE_PRESETS = [
  { value: 1, label: "Realistic" },
  { value: 1.25, label: "Balanced" },
  { value: 1.5, label: "Relaxed" },
];

type OrderMode = "random" | "unattempted-first" | "incorrect-first" | "bookmarked-first";
type PoolMode = "all" | "unattempted";

const ORDER_MODES: { value: OrderMode; label: string; hint: string }[] = [
  { value: "random", label: "Random", hint: "A random mix from the pool." },
  { value: "unattempted-first", label: "Unattempted first", hint: "Fresh questions first, fills in with the rest." },
  { value: "incorrect-first", label: "Incorrect first", hint: "Questions you got wrong before, first." },
  { value: "bookmarked-first", label: "Bookmarked first", hint: "Your bookmarked questions first, fills in with the rest." },
];

function sample<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function pickOrdered(
  pool: Question[],
  count: number,
  mode: OrderMode,
  statusMap: Map<string, string>,
  bookmarkedIds: Set<string>
) {
  if (mode === "unattempted-first" || mode === "incorrect-first") {
    const wanted = mode === "unattempted-first" ? "unattempted" : "incorrect";
    const priority = pool.filter((q) => (statusMap.get(q.id) ?? "unattempted") === wanted);
    const rest = pool.filter((q) => (statusMap.get(q.id) ?? "unattempted") !== wanted);
    const first = sample(priority, Math.min(count, priority.length));
    const remaining = count - first.length;
    return remaining > 0 ? [...first, ...sample(rest, remaining)] : first;
  }
  if (mode === "bookmarked-first") {
    const priority = pool.filter((q) => bookmarkedIds.has(q.id));
    const rest = pool.filter((q) => !bookmarkedIds.has(q.id));
    const first = sample(priority, Math.min(count, priority.length));
    const remaining = count - first.length;
    return remaining > 0 ? [...first, ...sample(rest, remaining)] : first;
  }
  return sample(pool, Math.min(count, pool.length));
}

function summaryChip(ids: string[], allLabel: string, names: (id: string) => string) {
  if (ids.length === 0) return allLabel;
  if (ids.length <= 2) return ids.map(names).join(" + ");
  return `${ids.length} selected`;
}

export default function CustomTestBuilderPage() {
  const [filters, setFilters] = useState<QuestionFiltersState>(EMPTY_QUESTION_FILTERS);
  const [count, setCount] = useState(20);
  const [useAll, setUseAll] = useState(false);
  const [timed, setTimed] = useState(false);
  // Stored as a pace (minutes per question) rather than raw minutes, so the
  // duration automatically stays proportional as the question count changes
  // — no separate clamping effect needed to keep it in range.
  const [minPerQuestion, setMinPerQuestion] = useState(MIN_MIN_PER_QUESTION);
  const [testName, setTestName] = useState("");
  const [orderMode, setOrderMode] = useState<OrderMode>("random");
  const [poolMode, setPoolMode] = useState<PoolMode>("all");
  const [filteredPool, setFilteredPool] = useState<Question[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const startSession = useStartSession();

  const sessions = usePracticeStore((s) => s.sessions);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const collections = useCollectionsStore((s) => s.collections);

  const statusMap = useMemo(
    () => getQuestionStatusMap(Object.values(sessions)),
    [sessions]
  );
  const bookmarkedIds = useMemo(() => new Set(bookmarks.map((b) => b.questionId)), [bookmarks]);

  useEffect(() => {
    let active = true;
    getQuestions({
      examIds: filters.examIds.length ? filters.examIds : undefined,
      years: filters.years.length ? filters.years : undefined,
      subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
      topicIds: filters.topicIds.length ? filters.topicIds : undefined,
    }).then((qs) => {
      if (active) setFilteredPool(qs);
    });
    return () => {
      active = false;
    };
  }, [filters]);

  const collectionFiltered = useMemo(
    () => getQuestionsInCollections(collections, filters.collectionIds, filteredPool),
    [collections, filters.collectionIds, filteredPool]
  );

  // Pool = filtered questions narrowed by "unattempted only" — this is what's
  // actually available to draw from, so the count picker and the CTA can
  // never silently overpromise. Ordering (below) only affects which of these
  // get picked first, not how many are eligible.
  const pool = useMemo(() => {
    if (poolMode === "unattempted") {
      return collectionFiltered.filter((q) => (statusMap.get(q.id) ?? "unattempted") === "unattempted");
    }
    return collectionFiltered;
  }, [collectionFiltered, poolMode, statusMap]);

  const availableCount = pool.length;
  // If a filter/mode change shrinks the pool below the selected count, this
  // derives the largest option that still fits — never lets the user hit
  // Start expecting more questions than actually exist, and never needs an
  // effect to keep `count` itself in sync. "All" tracks the live available
  // count rather than freezing it at whatever it was when selected.
  const finalCount = availableCount === 0 ? 0 : useAll ? availableCount : Math.min(Math.max(count, 1), availableCount);

  const minDurationMin = Math.round(finalCount * MIN_MIN_PER_QUESTION);
  const maxDurationMin = Math.round(finalCount * MAX_MIN_PER_QUESTION);
  const durationMin = Math.max(1, Math.round(finalCount * minPerQuestion));

  function handleConfirmStart() {
    const selected = pickOrdered(pool, finalCount, orderMode, statusMap, bookmarkedIds);
    startSession({
      mode: "custom-test",
      label: testName.trim() || "Custom Test",
      questionIds: selected.map((q) => q.id),
      filters: {
        examIds: filters.examIds.length ? filters.examIds : undefined,
        years: filters.years.length ? filters.years : undefined,
        subjectIds: filters.subjectIds.length ? filters.subjectIds : undefined,
        topicIds: filters.topicIds.length ? filters.topicIds : undefined,
        collectionIds: filters.collectionIds.length ? filters.collectionIds : undefined,
      },
      timed,
      durationSec: timed ? durationMin * 60 : undefined,
    });
  }

  const examSummary = summaryChip(
    filters.examIds,
    "All Exams",
    (id) => EXAMS.find((e) => e.id === id)?.shortName ?? id
  );
  const subjectSummary = summaryChip(
    filters.subjectIds,
    "All Subjects",
    (id) => SUBJECTS.find((s) => s.id === id)?.name ?? id
  );
  const timeSummary = timed ? `${durationMin} min timed` : "Untimed";
  const summaryLine = `${finalCount} question${finalCount === 1 ? "" : "s"} · ${examSummary} · ${subjectSummary} · ${timeSummary}`;

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
        <CardContent className="space-y-3">
          <FilterPanel value={filters} onChange={setFilters} />
          <ActiveFilterChips value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Number of questions</CardTitle>
          <CardDescription>
            Drawn from the {availableCount} question{availableCount === 1 ? "" : "s"} available with
            these filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUESTION_COUNTS.map((n) => {
              const disabled = n > availableCount;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  title={disabled ? `Only ${availableCount} available` : undefined}
                  onClick={() => {
                    setCount(n);
                    setUseAll(false);
                  }}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                    disabled
                      ? "cursor-not-allowed border-border text-muted-foreground/40"
                      : !useAll && finalCount === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {n}
                </button>
              );
            })}
            <button
              type="button"
              disabled={availableCount === 0}
              onClick={() => setUseAll(true)}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                availableCount === 0
                  ? "cursor-not-allowed border-border text-muted-foreground/40"
                  : useAll
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/30"
              )}
            >
              All
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs text-muted-foreground">Or drag to pick a number</Label>
              <div className="flex flex-col items-center gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(availableCount, 1)}
                  step={1}
                  value={useAll ? availableCount : count}
                  onKeyDown={(e) => {
                    // Block characters `type="number"` still lets through:
                    // minus/plus (negative/signed) and decimal/exponent entry.
                    if (["-", "+", ".", "e", "E"].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setUseAll(false);
                    setCount(Number.isFinite(next) && next > 0 ? Math.round(next) : 1);
                  }}
                  onBlur={() => {
                    if (!useAll && availableCount > 0 && count > availableCount) {
                      setCount(availableCount);
                    }
                  }}
                  disabled={availableCount === 0}
                  className="h-8 w-20 text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-[0.65rem] text-muted-foreground">questions</span>
              </div>
            </div>
            <Slider
              value={[finalCount || 1]}
              min={1}
              // Base UI requires max > min; availableCount is briefly 0 before
              // the async question fetch resolves (and could plausibly stay
              // at 1), so floor it at 2 rather than letting it equal min.
              max={Math.max(availableCount, 2)}
              step={1}
              disabled={availableCount === 0}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                setUseAll(false);
                setCount(next);
              }}
            />
          </div>

          {!useAll && availableCount > 0 && count > availableCount && (
            <p className="text-sm font-medium text-error-foreground">
              ⚠️ Only {availableCount} question{availableCount === 1 ? "" : "s"} match these filters —
              starting with {finalCount} instead.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timed test</CardTitle>
          <CardDescription>Practice under real exam time pressure.</CardDescription>
          <CardAction>
            <Switch checked={timed} onCheckedChange={setTimed} />
          </CardAction>
        </CardHeader>
        {timed && (
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PACE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={availableCount === 0}
                  onClick={() => setMinPerQuestion(preset.value)}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                    availableCount === 0
                      ? "cursor-not-allowed border-border text-muted-foreground/40"
                      : Math.abs(minPerQuestion - preset.value) < 0.01
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs text-muted-foreground">Or drag to pick a duration</Label>
              <div className="flex flex-col items-center gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={minDurationMin || 1}
                  max={Math.max(maxDurationMin, 1)}
                  step={1}
                  value={durationMin}
                  onKeyDown={(e) => {
                    if (["-", "+", ".", "e", "E"].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (finalCount > 0 && Number.isFinite(next) && next > 0) {
                      setMinPerQuestion(next / finalCount);
                    }
                  }}
                  onBlur={() => {
                    if (finalCount > 0) {
                      const clamped = Math.min(Math.max(durationMin, minDurationMin), maxDurationMin);
                      setMinPerQuestion(clamped / finalCount);
                    }
                  }}
                  disabled={availableCount === 0}
                  className="h-8 w-20 text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-[0.65rem] text-muted-foreground">minutes</span>
              </div>
            </div>
            <Slider
              value={[minPerQuestion]}
              min={MIN_MIN_PER_QUESTION}
              max={MAX_MIN_PER_QUESTION}
              step={0.1}
              disabled={availableCount === 0}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                setMinPerQuestion(next);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {minDurationMin} min (realistic pace) – {maxDurationMin} min (relaxed pace) for{" "}
              {finalCount} question{finalCount === 1 ? "" : "s"}.
            </p>
            <p className="rounded-lg bg-muted/60 p-2 text-[0.7rem] text-foreground">
              Note for Angad: this assumes 1 to 1.5 minutes per question — let us know if that pacing feels
              right for real exams, or if we should adjust it.
            </p>
          </CardContent>
        )}
      </Card>

      <div className="space-y-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center">
        <p className="text-base font-semibold text-foreground">{summaryLine}</p>
        <Button
          size="lg"
          className="w-full"
          onClick={() => setConfirmOpen(true)}
          disabled={availableCount === 0}
        >
          <Sparkles />
          Start Test
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ready to start?</DialogTitle>
            <DialogDescription>{summaryLine}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wide text-foreground uppercase">
              Include (optional)
            </Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "all" as const, label: "All questions" },
                  { value: "unattempted" as const, label: "Unattempted only" },
                ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPoolMode(opt.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors",
                    poolMode === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wide text-foreground uppercase">
              Ordering (optional)
            </Label>
            <div className="flex flex-wrap gap-2">
              {ORDER_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setOrderMode(m.value)}
                  title={m.hint}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors",
                    orderMode === m.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {ORDER_MODES.find((m) => m.value === orderMode)?.hint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-test-name" className="text-xs font-semibold tracking-wide text-foreground uppercase">
              Test name (optional)
            </Label>
            <Input
              id="confirm-test-name"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Custom Test"
              maxLength={60}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmStart}>
              <Sparkles />
              Start Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
