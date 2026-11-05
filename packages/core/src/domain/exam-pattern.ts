import type { Attempt, TestSession } from "./types";

/**
 * Exam patterns as the apps see them: how a real paper runs (sections, their
 * timings, marking), and the rules a running full mock follows on screen.
 * The server is the authority on which section is open and on the score;
 * these helpers only draw the same picture. Pure functions, shared by web
 * and mobile.
 */

/** An exact mark, so "1/3" is never 0.33. */
export interface Fraction {
  num: number;
  den: number;
}

export interface PatternSection {
  name: string;
  questions: number;
  minutes: number;
}

export interface ExamPattern {
  version: number;
  sections: PatternSection[];
  /** Each section opens when the one before closes, and closes for good with its own time. */
  sectionsLocked: boolean;
  marking: {
    correct: Fraction;
    /** Marks taken off for a wrong answer; 0 = no negative marking. */
    incorrect: Fraction;
  };
}

/** When one section of a running mock is open, from the server. */
export interface ExamSectionWindow {
  index: number;
  name: string;
  /** Question indices [firstPosition, firstPosition + questions). */
  firstPosition: number;
  questions: number;
  opensAt: string;
  closesAt: string;
}

export interface Marks {
  scored: number;
  max: number;
}

// --- Describing a pattern ----------------------------------------------------------

export function patternTotals(pattern: Pick<ExamPattern, "sections">): { questions: number; minutes: number } {
  return pattern.sections.reduce(
    (sum, s) => ({ questions: sum.questions + s.questions, minutes: sum.minutes + s.minutes }),
    { questions: 0, minutes: 0 }
  );
}

/** Whole numbers plainly, the rest as a fraction: "4", "1/3". */
export function formatFraction(value: Fraction): string {
  return value.den === 1 ? String(value.num) : `${value.num}/${value.den}`;
}

/** "4", "1/3" or "0.25" → an exact fraction; null when the text isn't a mark. */
export function parseFractionInput(text: string): Fraction | null {
  const value = text.trim();
  const fraction = /^(\d{1,4})\s*\/\s*(\d{1,2})$/.exec(value);
  if (fraction) {
    const den = Number(fraction[2]);
    return den > 0 ? reduce({ num: Number(fraction[1]), den }) : null;
  }
  const decimal = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value);
  if (!decimal) return null;
  const places = decimal[2] ?? "";
  return reduce({ num: Number(`${decimal[1]}${places}`), den: 10 ** places.length });
}

function reduce(value: Fraction): Fraction {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(value.num, value.den) || 1;
  return { num: value.num / divisor, den: value.den / divisor };
}

/** "+4 / −1", or "+1 · no negative marking". */
export function markingLabel(pattern: Pick<ExamPattern, "marking">): string {
  const { correct, incorrect } = pattern.marking;
  return incorrect.num === 0
    ? `+${formatFraction(correct)} · no negative marking`
    : `+${formatFraction(correct)} / −${formatFraction(incorrect)}`;
}

/** "3 h 30 min", "42 min", "2 h". */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

/** "5 sections of 36 questions, 42 min each" or a list when they differ. */
export function sectionsSummary(pattern: Pick<ExamPattern, "sections">): string {
  const [first] = pattern.sections;
  if (pattern.sections.length === 1) return `One paper of ${first.questions} questions`;
  const alike = pattern.sections.every((s) => s.questions === first.questions && s.minutes === first.minutes);
  if (alike) {
    return `${pattern.sections.length} sections of ${first.questions} questions, ${formatMinutes(first.minutes)} each`;
  }
  return pattern.sections.map((s) => `${s.name}: ${s.questions} q · ${formatMinutes(s.minutes)}`).join("; ");
}

/** Exact marks, rounded to two decimals only at the end (mirrors the server). */
export function marksFor(pattern: Pick<ExamPattern, "marking">, correct: number, incorrect: number): number {
  const { correct: c, incorrect: i } = pattern.marking;
  const numerator = correct * c.num * i.den - incorrect * i.num * c.den;
  return Math.round((numerator * 100) / (c.den * i.den)) / 100;
}

/** "412", "−3.33", "66.67" — marks as an exam result shows them. */
export function formatMarks(value: number): string {
  const text = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(2);
  return value < 0 ? `−${text}` : text;
}

// --- A running mock ----------------------------------------------------------------

/** "Now" on the server's clock, as this device best knows it. */
export function serverNow(session: Pick<TestSession, "clockOffsetMs">, now = Date.now()): number {
  return now + (session.clockOffsetMs ?? 0);
}

/** The section a question index belongs to, or null outside a mock. */
export function sectionIndexOf(session: Pick<TestSession, "sections">, questionIndex: number): number | null {
  const window = session.sections?.find(
    (w) => questionIndex >= w.firstPosition && questionIndex < w.firstPosition + w.questions
  );
  return window ? window.index : null;
}

/**
 * The section whose time is running, in a mock with time-bound sections:
 * the first whose window has not closed. Null when sections don't lock, or
 * once the last one has closed.
 */
export function activeSectionIndex(session: Pick<TestSession, "sections" | "pattern" | "clockOffsetMs">, now = Date.now()): number | null {
  if (!session.pattern?.sectionsLocked || !session.sections?.length) return null;
  const t = serverNow(session, now);
  const open = session.sections.find((w) => t < new Date(w.closesAt).getTime());
  return open ? open.index : null;
}

/**
 * Where a locked mock must be instead of `questionIndex`: the first question
 * of the running section, when the question asked for is in another one (a
 * closed section, or one not open yet). Null when it may stay where it is.
 */
export function lockedSectionRedirect(
  session: Pick<TestSession, "sections" | "pattern" | "clockOffsetMs" | "completedAt">,
  questionIndex: number,
  now = Date.now()
): number | null {
  if (session.completedAt) return null;
  const active = activeSectionIndex(session, now);
  if (active === null) return null;
  return sectionIndexOf(session, questionIndex) === active ? null : session.sections![active].firstPosition;
}

/** Seconds left in a section's window. */
export function sectionSecondsLeft(
  session: Pick<TestSession, "sections" | "clockOffsetMs">,
  sectionIndex: number,
  now = Date.now()
): number {
  const window = session.sections?.[sectionIndex];
  if (!window) return 0;
  return Math.max(0, Math.ceil((new Date(window.closesAt).getTime() - serverNow(session, now)) / 1000));
}

export interface SectionResult {
  name: string;
  questions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  marks: number;
  maxMarks: number;
}

/** Per-section score of a submitted mock, from its attempts (correctness is revealed by then). */
export function sectionResults(
  session: Pick<TestSession, "pattern" | "sections" | "questionIds">,
  attempts: Record<string, Attempt>
): SectionResult[] {
  const pattern = session.pattern;
  if (!pattern) return [];
  let position = 0;
  return pattern.sections.map((section) => {
    const ids = session.questionIds.slice(position, position + section.questions);
    position += section.questions;
    const answered = ids.map((id) => attempts[id]).filter(Boolean);
    const correct = answered.filter((a) => a.isCorrect).length;
    const incorrect = answered.length - correct;
    return {
      name: section.name,
      questions: section.questions,
      attempted: answered.length,
      correct,
      incorrect,
      unattempted: section.questions - answered.length,
      marks: marksFor(pattern, correct, incorrect),
      maxMarks: marksFor(pattern, section.questions, 0),
    };
  });
}
