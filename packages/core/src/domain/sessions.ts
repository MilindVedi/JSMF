import type { Attempt, ExamId, ReportReason, SessionMode, SessionQuestion, TestSession } from "./types";

/**
 * Session-level rules and copy shared by web and mobile: how a session is
 * named, where its results send the student next, how the review screen
 * filters and steps through questions, and how history sorts. Pure functions
 * only — each app owns its routes and maps the `target`s below onto them.
 */

/** The most a single session can hold (backend MAX_SESSION_QUESTIONS). */
export const MAX_SESSION_QUESTIONS = 200;

export const SESSION_MODE_LABEL: Record<SessionMode, string> = {
  browse: "Question Bank",
  "custom-test": "Custom Test",
  bookmarks: "Bookmarks Revision",
  "wrong-questions": "Wrong Questions Revision",
};

export const DIFFICULTY_LABEL: Record<SessionQuestion["difficulty"], string> = {
  easy: "Easy",
  medium: "Moderate",
  hard: "Hard",
};

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: "wrong-answer", label: "The marked answer is wrong" },
  { id: "wrong-explanation", label: "The explanation is wrong or unclear" },
  { id: "incorrect-question", label: "The question itself is incorrect or ambiguous" },
  { id: "image-issue", label: "There's an issue with an image" },
  { id: "other", label: "Something else" },
];

export const EXAM_LABEL: Record<ExamId, string> = {
  "neet-pg": "NEET-PG",
  fmge: "FMGE",
  inicet: "INI-CET",
};

// --- Results ---------------------------------------------------------------------

/** The wording adapts to how the session was started — "Test completed" is
 *  wrong for a question-bank browse, and vice versa. */
export function completionKicker(session: TestSession): string {
  switch (session.mode) {
    case "custom-test":
      return "Test completed";
    case "wrong-questions":
      return "Revision complete";
    case "bookmarks":
      return "Bookmark review complete";
    default:
      return session.label;
  }
}

/** Where the results screen's secondary button goes; each app maps `target` to a route. */
export type ResultsNextTarget = "custom-test" | "revision" | "question-bank";

export function resultsNextAction(session: TestSession): { label: string; target: ResultsNextTarget } {
  switch (session.mode) {
    case "custom-test":
      return { label: "Start another test", target: "custom-test" };
    case "wrong-questions":
    case "bookmarks":
      return { label: "Back to Revision", target: "revision" };
    default:
      return { label: "Back to Question Bank", target: "question-bank" };
  }
}

/** "4m 12s", or "12s" under a minute. */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** The tone a session's accuracy is shown in: ≥70 good, ≥40 middling, else poor. */
export function accuracyTone(accuracy: number): "success" | "flag" | "error" {
  return accuracy >= 70 ? "success" : accuracy >= 40 ? "flag" : "error";
}

// --- Review ---------------------------------------------------------------------

export type ReviewFilter = "all" | "correct" | "incorrect" | "unattempted";
export type ReviewStatus = "correct" | "incorrect" | "unattempted";

export function reviewStatusOf(session: Pick<TestSession, "attempts">, questionId: string): ReviewStatus {
  const attempt: Attempt | undefined = session.attempts[questionId];
  if (!attempt) return "unattempted";
  return attempt.isCorrect ? "correct" : "incorrect";
}

export function reviewCounts(session: Pick<TestSession, "attempts" | "questionIds">): Record<ReviewFilter, number> {
  let correct = 0;
  let incorrect = 0;
  let unattempted = 0;
  for (const id of session.questionIds) {
    const s = reviewStatusOf(session, id);
    if (s === "correct") correct += 1;
    else if (s === "incorrect") incorrect += 1;
    else unattempted += 1;
  }
  return { all: session.questionIds.length, correct, incorrect, unattempted };
}

/** Land on "incorrect" by default when there's anything to review — that's
 *  the whole point of opening review from a completed test. */
export function defaultReviewFilter(counts: Record<ReviewFilter, number>): ReviewFilter {
  return counts.incorrect > 0 ? "incorrect" : "all";
}

/** First question in the session matching a filter, so switching filters (or
 *  landing with none set) lands somewhere that filter actually shows. */
export function firstIndexForFilter(session: Pick<TestSession, "attempts" | "questionIds">, filter: ReviewFilter): number {
  if (filter === "all") return 0;
  const i = session.questionIds.findIndex((id) => reviewStatusOf(session, id) === filter);
  return i === -1 ? 0 : i;
}

/** Absolute indices of the questions a filter shows. */
export function reviewIndices(session: Pick<TestSession, "attempts" | "questionIds">, filter: ReviewFilter): number[] {
  return session.questionIds
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => filter === "all" || reviewStatusOf(session, id) === filter)
    .map(({ i }) => i);
}

/** The nearest question in `indices` on one side of `current` — wraps around
 *  so Prev/Next always has somewhere to go within the active filter. */
export function neighborIndex(indices: number[], current: number, direction: 1 | -1): number | null {
  if (indices.length === 0) return null;
  if (direction === 1) {
    return indices.find((i) => i > current) ?? indices[0];
  }
  const before = indices.filter((i) => i < current);
  return before.length > 0 ? before[before.length - 1] : indices[indices.length - 1];
}

// --- Running a session -----------------------------------------------------------

/** Seconds left on a timed session, measured from when it started. */
export function remainingSeconds(session: Pick<TestSession, "config" | "startedAt">, now = Date.now()): number {
  const { durationSec } = session.config;
  if (!durationSec) return 0;
  const elapsed = Math.floor((now - new Date(session.startedAt).getTime()) / 1000);
  return Math.max(0, durationSec - elapsed);
}

/** The last five minutes of a test turn the exam clock to the warning colour. */
export const EXAM_WARN_AT_SEC = 5 * 60;

const pad = (n: number) => n.toString().padStart(2, "0");

/** `hh:mm:ss` (exam console) or `m:ss`. */
export function formatClock(totalSec: number, withHours: boolean): string {
  if (withHours) {
    return `${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor((totalSec % 3600) / 60))}:${pad(totalSec % 60)}`;
  }
  return `${Math.floor(totalSec / 60)}:${pad(totalSec % 60)}`;
}

/** A test drawn from one exam is that exam's mock; otherwise the student's own target exam. */
export function examMockExamId(session: Pick<TestSession, "filters">, targetExamId: string | null | undefined): string | null {
  const filtered = session.filters?.examIds ?? [];
  return filtered.length === 1 ? filtered[0] : (targetExamId ?? null);
}

/** Initials for an avatar fallback: up to two, "?" when there is no name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
