"use client";

import { useMemo, useState } from "react";
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
import { AngadNote } from "@/components/dev/angad-note";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { pyqCapabilities, useQuestionCount, useStartSession, useTaxonomyLookup } from "@/hooks/pyq";
import type { QuestionQuery, SessionOrder } from "@/lib/data-source";

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

type OrderMode = SessionOrder;
type PoolMode = "all" | "unattempted";

const ORDER_MODES: { value: OrderMode; label: string; hint: string }[] = [
  { value: "random", label: "Random", hint: "A random mix from the pool." },
  { value: "unattempted-first", label: "Unattempted first", hint: "Fresh questions first, fills in with the rest." },
  { value: "incorrect-first", label: "Incorrect first", hint: "Questions you got wrong before, first." },
  { value: "bookmarked-first", label: "Bookmarked first", hint: "Your bookmarked questions first, fills in with the rest." },
];

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const startSession = useStartSession();
  const lookup = useTaxonomyLookup();

  // The pool is "filtered questions, narrowed to unattempted if asked" — counted
  // by the data source so the count picker and CTA never overpromise.
  const query = useMemo<QuestionQuery>(() => {
    const pick = <T,>(list: T[]) => (list.length ? list : undefined);
    return {
      examIds: pick(filters.examIds),
      years: pick(filters.years),
      subjectIds: pick(filters.subjectIds),
      topicIds: pick(filters.topicIds),
      collectionIds: pyqCapabilities.collections ? pick(filters.collectionIds) : undefined,
      status: poolMode === "unattempted" ? "unattempted" : undefined,
    };
  }, [filters, poolMode]);
  const { count: poolCount, isPending: countPending, error: countError } = useQuestionCount(query);

  // Sessions hold at most 200 questions (backend MAX_SESSION_QUESTIONS).
  const availableCount = Math.min(poolCount, 200);
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
    setConfirmOpen(false);
    void startSession({
      mode: "custom-test",
      label: testName.trim() || "Custom Test",
      filters: query,
      count: finalCount,
      order: orderMode,
      timed,
      durationSec: timed ? durationMin * 60 : undefined,
    });
  }

  const examSummary = summaryChip(
    filters.examIds,
    "All Exams",
    (id) => lookup.exam(id)?.shortName ?? id
  );
  const subjectSummary = summaryChip(
    filters.subjectIds,
    "All Subjects",
    (id) => lookup.subject(id)?.name ?? id
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
            {countError
              ? "Couldn't count the available questions — check your connection and try again."
              : countPending
                ? "Counting available questions…"
                : `Drawn from the ${availableCount} question${availableCount === 1 ? "" : "s"} available with these filters.`}
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
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {minDurationMin} min (realistic pace) – {maxDurationMin} min (relaxed pace) for{" "}
                {finalCount} question{finalCount === 1 ? "" : "s"}.
              </p>
              <AngadNote>
                <p className="font-semibold text-foreground">Why 1–1.5 minutes per question?</p>
                <p>
                  1 minute/question is meant to read as a brisk, confident pace, and 1.5 minutes as a
                  slower, double-check-the-stem pace — the two ends most aspirants actually fall between,
                  rather than trying to mirror any one specific exam&apos;s exact time limit (that varies by
                  exam and can change over time).
                </p>
                <p>
                  Both the preview text above and the real timer scale off wherever the slider sits in that
                  range, multiplied by however many questions are in the test — so it&apos;s never a fixed
                  number, it moves with the test size.
                </p>
                <p>Flag it if 1–1.5 min/question feels off for how you&apos;d actually pace a real attempt — we can retune either end.</p>
              </AngadNote>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="space-y-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center">
        <p className="text-base font-semibold text-foreground">{summaryLine}</p>
        <Button
          size="lg"
          className="w-full"
          onClick={() => setConfirmOpen(true)}
          disabled={availableCount === 0 || startSession.isPending}
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

          {pyqCapabilities.sessionOrdering && (
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
          )}

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
