import type { PublicQuestion } from "./types";

/**
 * A "paper": one sitting of an exam, as students filter by it — the year, plus
 * the session's month for exams held more than once a year, so FMGE June 2026
 * and FMGE December 2026 stay apart. Keys are the API's:
 *
 * - `2026-06` — the June 2026 session;
 * - `2026`    — 2026 questions with no month recorded (most exams, which are
 *               held once a year).
 *
 * Same rules as the backend's domain/exam-paper.ts.
 */
export interface ExamPaper {
  key: string;
  year: number;
  /** 1–12, or null when the month is not recorded. */
  month: number | null;
  /** "June 2026", or "2025" with no month. */
  label: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const PAPER_KEY = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

function validMonth(month: number | null | undefined): month is number {
  return typeof month === "number" && Number.isInteger(month) && month >= 1 && month <= 12;
}

export function paperKey(year: number, month?: number | null): string {
  return validMonth(month) ? `${year}-${String(month).padStart(2, "0")}` : String(year);
}

/** The paper a question belongs to. */
export function paperKeyOf(question: Pick<PublicQuestion, "year" | "sessionMonth">): string {
  return paperKey(question.year, question.sessionMonth);
}

export function parsePaperKey(key: string): { year: number; month: number | null } | null {
  const match = PAPER_KEY.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), month: match[2] ? Number(match[2]) : null };
}

/**
 * "June 2026" (`long`), "Jun 2026" (`short`, for small badges), or just the
 * year when no month is recorded.
 */
export function paperLabel(year: number, month?: number | null, style: "long" | "short" = "long"): string {
  if (!validMonth(month)) return String(year);
  const name = MONTHS[month - 1];
  return `${style === "short" ? name.slice(0, 3) : name} ${year}`;
}

/** A filter chip's label from its key; an unreadable key shows as written. */
export function paperKeyLabel(key: string): string {
  const paper = parsePaperKey(key);
  return paper ? paperLabel(paper.year, paper.month) : key;
}

export function toExamPaper(year: number, month: number | null): ExamPaper {
  return { key: paperKey(year, month), year, month: validMonth(month) ? month : null, label: paperLabel(year, month) };
}

/** Newest first; within a year, the later session first and "no month" last. */
export function comparePapersNewestFirst(
  a: { year: number; month?: number | null },
  b: { year: number; month?: number | null }
): number {
  if (a.year !== b.year) return b.year - a.year;
  const am = validMonth(a.month) ? a.month : null;
  const bm = validMonth(b.month) ? b.month : null;
  if (am === bm) return 0;
  if (am === null) return 1;
  if (bm === null) return -1;
  return bm - am;
}

/** Exam/Paper narrowing shared by every Revision section ("empty = all"). */
export function matchesExamPaper(question: PublicQuestion, examIds: string[], papers: string[]): boolean {
  return (
    (examIds.length === 0 || examIds.includes(question.examId)) &&
    (papers.length === 0 || papers.includes(paperKeyOf(question)))
  );
}
