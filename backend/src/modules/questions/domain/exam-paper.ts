/**
 * A "paper": one sitting of an exam, as students filter by it — the year, plus
 * the session's month for exams held more than once a year (FMGE in June and
 * December). Clients address a paper by key:
 *
 * - `2026-06` — the June 2026 session;
 * - `2026`    — 2026 questions with no month recorded (most exams, which are
 *               held once a year).
 *
 * The same rules live in @jsmf/core (domain/exam-paper.ts) for the apps.
 */
export const PAPER_KEY = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

export interface Paper {
  year: number;
  /** 1–12, or null when the question's month is not recorded. */
  month: number | null;
}

export function parsePaperKey(key: string): Paper | null {
  const match = PAPER_KEY.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), month: match[2] ? Number(match[2]) : null };
}

export function paperKey(year: number, month: number | null): string {
  return month ? `${year}-${String(month).padStart(2, '0')}` : String(year);
}

/** Newest first; within a year, the later session first and "no month" last. */
export function comparePapersNewestFirst(a: Paper, b: Paper): number {
  if (a.year !== b.year) return b.year - a.year;
  if (a.month === b.month) return 0;
  if (a.month === null) return 1;
  if (b.month === null) return -1;
  return b.month - a.month;
}
