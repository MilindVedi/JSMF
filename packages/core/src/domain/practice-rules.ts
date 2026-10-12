import type { SessionOrder } from "../data-source/types";
import type { DayRange } from "./selectors";
import type { PublicQuestion } from "./types";

/**
 * The custom-test builder's and the Revision hub's rules, shared by web and
 * mobile so both offer the same counts, paces, orderings and date windows.
 */

// --- Custom test -----------------------------------------------------------------

export const CUSTOM_TEST_QUESTION_COUNTS = [10, 20, 30, 50];

// Real exams run close to 1 minute/question (NEET-PG ~63s, FMGE ~60s,
// INI-CET ~54s), so 1x is the realistic-pace floor. 1.5x is the ceiling for
// relaxed practice — past that the timer stops meaningfully constraining
// anything, so it isn't offered.
export const MIN_MIN_PER_QUESTION = 1;
export const MAX_MIN_PER_QUESTION = 1.5;

export const PACE_PRESETS = [
  { value: 1, label: "Realistic" },
  { value: 1.25, label: "Balanced" },
  { value: 1.5, label: "Relaxed" },
];

export const SESSION_ORDER_MODES: { value: SessionOrder; label: string; hint: string }[] = [
  { value: "random", label: "Random", hint: "A random mix from the pool." },
  { value: "unattempted-first", label: "Unattempted first", hint: "Fresh questions first, fills in with the rest." },
  { value: "incorrect-first", label: "Incorrect first", hint: "Questions you got wrong before, first." },
  { value: "bookmarked-first", label: "Bookmarked first", hint: "Your bookmarked questions first, fills in with the rest." },
];

/**
 * The count a custom test actually starts with: never more than the pool
 * holds, "All" tracking the live pool. `availableCount` is already capped at
 * the session maximum.
 */
export function customTestFinalCount(availableCount: number, requested: number, useAll: boolean): number {
  if (availableCount === 0) return 0;
  return useAll ? availableCount : Math.min(Math.max(requested, 1), availableCount);
}

/** Minutes for a timed test at a pace, plus the realistic–relaxed bounds. */
export function customTestDurations(finalCount: number, minPerQuestion: number) {
  return {
    minDurationMin: Math.round(finalCount * MIN_MIN_PER_QUESTION),
    maxDurationMin: Math.round(finalCount * MAX_MIN_PER_QUESTION),
    durationMin: Math.max(1, Math.round(finalCount * minPerQuestion)),
  };
}

/** "A + B", or "N selected" past two, or the all-label when nothing is picked. */
export function selectionSummary(ids: string[], allLabel: string, names: (id: string) => string): string {
  if (ids.length === 0) return allLabel;
  if (ids.length <= 2) return ids.map(names).join(" + ");
  return `${ids.length} selected`;
}

// --- Revision date windows ---------------------------------------------------------

export type DatePreset = "7d" | "14d" | "30d" | "90d" | "all" | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string; days?: number }[] = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "14d", label: "Last 14 days", days: 14 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

export function computeDateRange(preset: DatePreset, from: string, to: string, todayISO: string | null): DayRange | null {
  if (preset === "custom") {
    if (!from && !to) return null;
    return { from: from || null, to: to || null };
  }
  if (preset === "all") return { from: null, to: null };
  if (!todayISO) return null;
  const days = DATE_PRESETS.find((p) => p.value === preset)?.days;
  if (!days) return null;
  const from_ = new Date(new Date(todayISO).getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return { from: from_, to: null };
}

export function isWithinRange(dayISO: string, range: DayRange): boolean {
  const afterFrom = !range.from || dayISO >= range.from;
  const beforeTo = !range.to || dayISO <= range.to;
  return afterFrom && beforeTo;
}

export function dateRangeDescription(preset: DatePreset, from: string, to: string, verb: string, allTimeText: string): string {
  if (preset === "custom") {
    if (from && to) return `${verb} between ${from} and ${to}.`;
    if (from) return `${verb} since ${from}.`;
    if (to) return `${verb} up to ${to}.`;
    return "Pick a custom date range above.";
  }
  if (preset === "all") return allTimeText;
  const days = DATE_PRESETS.find((p) => p.value === preset)?.days;
  return `${verb} in the last ${days} days.`;
}

export function groupBySubject<T extends PublicQuestion>(questions: T[]): { subjectId: string; questions: T[] }[] {
  const map = new Map<string, T[]>();
  for (const q of questions) {
    const list = map.get(q.subjectId);
    if (list) list.push(q);
    else map.set(q.subjectId, [q]);
  }
  return Array.from(map.entries())
    .map(([subjectId, qs]) => ({ subjectId, questions: qs }))
    .sort((a, b) => b.questions.length - a.questions.length);
}

/** Substring match against the question stem — the only text a search box
 *  over a question list can meaningfully search. */
export function filterByStem<T extends PublicQuestion>(questions: T[], search: string): T[] {
  const term = search.trim().toLowerCase();
  if (!term) return questions;
  return questions.filter((q) => q.stem.toLowerCase().includes(term));
}

/** Exam/Year narrowing shared by every Revision section ("empty = all"). */
export function matchesExamYear(q: PublicQuestion, examIds: string[], years: number[]): boolean {
  return (examIds.length === 0 || examIds.includes(q.examId)) && (years.length === 0 || years.includes(q.year));
}
