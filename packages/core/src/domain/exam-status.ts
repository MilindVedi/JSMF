import type { Attempt } from "./types";

/**
 * The five question states of a computer-based exam console (NEET-PG, FMGE,
 * INI-CET). Derived, never stored: a saved answer is the session's attempt,
 * "marked" is the session's existing review flag, and "visited" is the only
 * extra fact, kept client-side by `useVisitedQuestions`.
 */
export type ExamQuestionStatus = "answered" | "not-answered" | "not-visited" | "marked" | "answered-marked";

export const EXAM_STATUS_ORDER: ExamQuestionStatus[] = [
  "answered",
  "not-answered",
  "not-visited",
  "marked",
  "answered-marked",
];

export const EXAM_STATUS_LABEL: Record<ExamQuestionStatus, string> = {
  answered: "Answered",
  "not-answered": "Not Answered",
  "not-visited": "Not Visited",
  marked: "Marked for Review",
  "answered-marked": "Answered & Marked for Review",
};

export function examStatusOf({
  answered,
  flagged,
  visited,
}: {
  answered: boolean;
  flagged: boolean;
  visited: boolean;
}): ExamQuestionStatus {
  if (answered && flagged) return "answered-marked";
  if (flagged) return "marked";
  if (answered) return "answered";
  return visited ? "not-answered" : "not-visited";
}

export type ExamStatusCounts = Record<ExamQuestionStatus, number>;

export function examStatuses({
  questionIds,
  attempts,
  flags,
  visited,
}: {
  questionIds: string[];
  attempts: Record<string, Attempt>;
  flags: Record<string, boolean>;
  visited: ReadonlySet<string>;
}): { statuses: ExamQuestionStatus[]; counts: ExamStatusCounts } {
  const counts: ExamStatusCounts = {
    answered: 0,
    "not-answered": 0,
    "not-visited": 0,
    marked: 0,
    "answered-marked": 0,
  };
  const statuses = questionIds.map((id) => {
    const answered = Boolean(attempts[id]);
    const flagged = Boolean(flags[id]);
    // Answering or marking a question means it was opened, even if the
    // browser that opened it is not this one.
    const status = examStatusOf({ answered, flagged, visited: visited.has(id) || answered || flagged });
    counts[status] += 1;
    return status;
  });
  return { statuses, counts };
}
