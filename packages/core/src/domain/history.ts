import type { SessionListItem } from "../data-source/types";
import type { TestSession } from "./types";

/**
 * History and dashboard rules shared by web and mobile: how a finished
 * session sorts, and how a session's scope is described in one line.
 */

export type SessionSortOption =
  | "recently-attempted"
  | "least-recently-attempted"
  | "newest-exam-year"
  | "oldest-exam-year"
  | "highest-accuracy"
  | "lowest-accuracy"
  | "recently-wrong"
  | "oldest-wrong"
  | "name-az"
  | "name-za"
  | "unattempted";

export const SESSION_SORT_LABELS: Record<SessionSortOption, string> = {
  "recently-attempted": "Recently attempted",
  "least-recently-attempted": "Least recently attempted",
  "newest-exam-year": "Most recent — latest exam",
  "oldest-exam-year": "Oldest first",
  "highest-accuracy": "Highest accuracy",
  "lowest-accuracy": "Lowest accuracy",
  "recently-wrong": "Recently wrong",
  "oldest-wrong": "Oldest wrong",
  "name-az": "Name A–Z",
  "name-za": "Name Z–A",
  unattempted: "Unattempted",
};

/** Opposite-direction pairs share a group id so a sort menu can tint each pair distinctly. */
export const SESSION_SORT_GROUPS: Partial<Record<SessionSortOption, string>> = {
  "recently-attempted": "attempted",
  "least-recently-attempted": "attempted",
  "newest-exam-year": "exam-year",
  "oldest-exam-year": "exam-year",
  "highest-accuracy": "accuracy",
  "lowest-accuracy": "accuracy",
  "recently-wrong": "wrong",
  "oldest-wrong": "wrong",
  "name-az": "name",
  "name-za": "name",
};

export interface SessionSortKeys {
  newestYear: number;
  oldestYear: number;
  lastWrongAt?: string;
  accuracy: number;
  unattemptedCount: number;
}

export function buildSessionSortKeys(item: SessionListItem): SessionSortKeys {
  return {
    newestYear: item.newestYear ?? -Infinity,
    oldestYear: item.oldestYear ?? Infinity,
    lastWrongAt: item.lastWrongAt,
    accuracy: item.accuracy,
    unattemptedCount: item.unattempted,
  };
}

/** Missing values (e.g. a session with no wrong attempts) always sort last,
 *  in either direction — it isn't "the oldest wrong", it just has none. */
function compareOptionalString(a: string | undefined, b: string | undefined, direction: "asc" | "desc") {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (a === b) return 0;
  const cmp = a < b ? -1 : 1;
  return direction === "desc" ? -cmp : cmp;
}

export function sortSessions(
  sessions: TestSession[],
  sort: SessionSortOption,
  keysById: Map<string, SessionSortKeys>
): TestSession[] {
  const arr = [...sessions];
  const keyOf = (s: TestSession) => keysById.get(s.id)!;
  switch (sort) {
    case "recently-attempted":
      arr.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
      break;
    case "least-recently-attempted":
      arr.sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
      break;
    case "newest-exam-year":
      arr.sort((a, b) => keyOf(b).newestYear - keyOf(a).newestYear);
      break;
    case "oldest-exam-year":
      arr.sort((a, b) => keyOf(a).oldestYear - keyOf(b).oldestYear);
      break;
    case "highest-accuracy":
      arr.sort((a, b) => keyOf(b).accuracy - keyOf(a).accuracy);
      break;
    case "lowest-accuracy":
      arr.sort((a, b) => keyOf(a).accuracy - keyOf(b).accuracy);
      break;
    case "recently-wrong":
      arr.sort((a, b) => compareOptionalString(keyOf(a).lastWrongAt, keyOf(b).lastWrongAt, "desc"));
      break;
    case "oldest-wrong":
      arr.sort((a, b) => compareOptionalString(keyOf(a).lastWrongAt, keyOf(b).lastWrongAt, "asc"));
      break;
    case "name-az":
      arr.sort((a, b) => a.label.localeCompare(b.label));
      break;
    case "name-za":
      arr.sort((a, b) => b.label.localeCompare(a.label));
      break;
    case "unattempted":
      arr.sort((a, b) => keyOf(b).unattemptedCount - keyOf(a).unattemptedCount);
      break;
  }
  return arr;
}

interface ScopeLookup {
  examCount: number;
  subjectCount: number;
  examName: (id: string) => string;
  subjectName: (id: string) => string;
}

/** "NEET-PG · Pharmacology · 20 questions" — what a session actually covers. */
export function sessionScopeDescription(item: SessionListItem, lookup: ScopeLookup): string {
  const { examIds, subjectIds, totalQuestions: questionCount } = item;
  const examNames = examIds.map(lookup.examName);
  const subjectNames = subjectIds.map(lookup.subjectName);

  // Name what's actually covered when it's a short list; fall back to a count
  // only when spelling it out would be noise. Empty means "not narrowed".
  const exam =
    examIds.length === 0 || examIds.length >= lookup.examCount
      ? "All exams"
      : examNames.length <= 2
        ? examNames.join(" & ")
        : `${examIds.length} exams`;
  const subject =
    subjectIds.length === 0 || subjectIds.length >= lookup.subjectCount
      ? "All subjects"
      : subjectNames.length === 1
        ? subjectNames[0]
        : subjectNames.length === 2
          ? subjectNames.join(" & ")
          : "Mixed subjects";

  return `${exam} · ${subject} · ${questionCount} question${questionCount === 1 ? "" : "s"}`;
}

/** The session's own type (its label) followed by what it covers. */
export function sessionScopeLabel(item: SessionListItem, lookup: ScopeLookup): string {
  return `${item.session.label} · ${sessionScopeDescription(item, lookup)}`;
}
