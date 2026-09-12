import type { BookmarkEntry, Collection, Question, Subject, TestSession } from "@/types";

/**
 * Every sort a question list can offer across the app. Not every page shows
 * every option — see `QUESTION_BANK_SORT_OPTIONS` and
 * `REVISION_SECTION_SORT_OPTIONS` below for the subsets that actually make
 * sense in each context.
 */
export type QuestionSortOption =
  | "recently-attempted"
  | "least-recently-attempted"
  | "newest-exam-year"
  | "oldest-exam-year"
  | "name-az"
  | "name-za"
  | "recently-wrong"
  | "oldest-wrong"
  | "most-incorrect-attempts"
  | "recently-bookmarked"
  | "oldest-bookmarked"
  | "recently-correct"
  | "oldest-correct"
  | "collected-recently"
  | "collected-earliest";

export const QUESTION_SORT_LABELS: Record<QuestionSortOption, string> = {
  "recently-attempted": "Recently attempted",
  "least-recently-attempted": "Least recently attempted",
  "newest-exam-year": "Most recent — latest exam",
  "oldest-exam-year": "Oldest first",
  "name-az": "Subject A–Z",
  "name-za": "Subject Z–A",
  "recently-wrong": "Recently wrong",
  "oldest-wrong": "Oldest wrong",
  "most-incorrect-attempts": "Most incorrect attempts",
  "recently-bookmarked": "Recently bookmarked",
  "oldest-bookmarked": "Oldest bookmarked",
  "recently-correct": "Recently correct",
  "oldest-correct": "Oldest correct",
  "collected-recently": "Collected recently",
  "collected-earliest": "Collected earliest",
};

/** Groups sort options into the same category as one another — sharing a
 *  group id gives them the same background tint in a `SortDropdown`, so a
 *  long option list reads as a handful of related clusters instead of one
 *  undifferentiated column. Most groups are a simple opposite-direction pair
 *  ("Recently attempted"/"Least recently attempted"), but "wrong" is a trio:
 *  "Most incorrect attempts" belongs with "Recently wrong"/"Oldest wrong" as
 *  the same underlying concept (how wrong this question has been), even
 *  though it has no opposite direction of its own. */
export const QUESTION_SORT_GROUPS: Partial<Record<QuestionSortOption, string>> = {
  "recently-attempted": "attempted",
  "least-recently-attempted": "attempted",
  "newest-exam-year": "exam-year",
  "oldest-exam-year": "exam-year",
  "name-az": "subject-name",
  "name-za": "subject-name",
  "recently-wrong": "wrong",
  "oldest-wrong": "wrong",
  "most-incorrect-attempts": "wrong",
  "recently-bookmarked": "bookmarked",
  "oldest-bookmarked": "bookmarked",
  "recently-correct": "correct",
  "oldest-correct": "correct",
  "collected-recently": "collected",
  "collected-earliest": "collected",
};

/** "Name A–Z/Z–A" sorts by subject name, since questions don't have a short
 *  name of their own — sorting the raw stem text alphabetically would read
 *  like a phone book of paragraphs, not a meaningful order. */
export const QUESTION_BANK_SORT_OPTIONS: QuestionSortOption[] = [
  "newest-exam-year",
  "oldest-exam-year",
  "name-az",
  "name-za",
];

export const REVISION_GLOBAL_SORT_OPTIONS: QuestionSortOption[] = Object.keys(
  QUESTION_SORT_LABELS
) as QuestionSortOption[];

/** Options relevant to each Revision hub section — e.g. "Recently bookmarked"
 *  only means something in the Bookmarked section, "Collected recently" only
 *  in the Collections section. Each section-local dropdown offers only its
 *  own subset, alongside the generic options (recency/exam-year/name) that
 *  apply everywhere. */
export const REVISION_SECTION_SORT_OPTIONS = {
  wrong: [
    "recently-attempted",
    "least-recently-attempted",
    "newest-exam-year",
    "oldest-exam-year",
    "name-az",
    "name-za",
    "recently-wrong",
    "oldest-wrong",
    "most-incorrect-attempts",
  ],
  bookmarked: [
    "recently-attempted",
    "least-recently-attempted",
    "newest-exam-year",
    "oldest-exam-year",
    "name-az",
    "name-za",
    "recently-bookmarked",
    "oldest-bookmarked",
  ],
  reinforce: [
    "recently-attempted",
    "least-recently-attempted",
    "newest-exam-year",
    "oldest-exam-year",
    "name-az",
    "name-za",
    "recently-correct",
    "oldest-correct",
  ],
  collections: [
    "recently-attempted",
    "least-recently-attempted",
    "newest-exam-year",
    "oldest-exam-year",
    "name-az",
    "name-za",
    "collected-recently",
    "collected-earliest",
  ],
} satisfies Record<string, QuestionSortOption[]>;

export interface QuestionSortContext {
  subjectNameById: Map<string, string>;
  /** questionId -> ISO timestamp of its most recent attempt, any result. */
  lastAttemptedAt: Map<string, string>;
  /** questionId -> ISO timestamp of its most recent incorrect attempt. */
  lastWrongAt: Map<string, string>;
  /** questionId -> total number of incorrect attempts, ever. */
  incorrectCount: Map<string, number>;
  /** questionId -> ISO timestamp of its most recent correct attempt. */
  lastCorrectAt: Map<string, string>;
  /** questionId -> when it was bookmarked. */
  bookmarkedAt: Map<string, string>;
  /** questionId -> createdAt of the most recently created collection that
   *  contains it (a question in several collections takes the newest one). */
  collectedAt: Map<string, string>;
}

export function buildQuestionSortContext(
  sessions: TestSession[],
  bookmarks: BookmarkEntry[],
  collections: Collection[],
  subjects: Subject[]
): QuestionSortContext {
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name] as const));
  const lastAttemptedAt = new Map<string, string>();
  const lastWrongAt = new Map<string, string>();
  const lastCorrectAt = new Map<string, string>();
  const incorrectCount = new Map<string, number>();

  for (const session of sessions) {
    for (const attempt of Object.values(session.attempts)) {
      const prevAttempted = lastAttemptedAt.get(attempt.questionId);
      if (!prevAttempted || attempt.answeredAt > prevAttempted) {
        lastAttemptedAt.set(attempt.questionId, attempt.answeredAt);
      }
      if (attempt.isCorrect) {
        const prevCorrect = lastCorrectAt.get(attempt.questionId);
        if (!prevCorrect || attempt.answeredAt > prevCorrect) {
          lastCorrectAt.set(attempt.questionId, attempt.answeredAt);
        }
      } else {
        incorrectCount.set(attempt.questionId, (incorrectCount.get(attempt.questionId) ?? 0) + 1);
        const prevWrong = lastWrongAt.get(attempt.questionId);
        if (!prevWrong || attempt.answeredAt > prevWrong) {
          lastWrongAt.set(attempt.questionId, attempt.answeredAt);
        }
      }
    }
  }

  const bookmarkedAt = new Map(bookmarks.map((b) => [b.questionId, b.createdAt] as const));

  const collectedAt = new Map<string, string>();
  for (const c of collections) {
    for (const questionId of c.questionIds) {
      const prev = collectedAt.get(questionId);
      if (!prev || c.createdAt > prev) collectedAt.set(questionId, c.createdAt);
    }
  }

  return { subjectNameById, lastAttemptedAt, lastWrongAt, incorrectCount, lastCorrectAt, bookmarkedAt, collectedAt };
}

/** ISO timestamps compare correctly as plain strings, so recency sorts don't
 *  need to parse dates. Missing values always sort last, in either direction
 *  — a question with no attempt/bookmark/etc. isn't "the oldest", it just
 *  doesn't have that property at all. */
function compareRecency(aId: string, bId: string, map: Map<string, string>, direction: "asc" | "desc") {
  const a = map.get(aId);
  const b = map.get(bId);
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (a === b) return 0;
  const cmp = a < b ? -1 : 1;
  return direction === "desc" ? -cmp : cmp;
}

export function sortQuestions(
  questions: Question[],
  sort: QuestionSortOption,
  ctx: QuestionSortContext
): Question[] {
  const arr = [...questions];
  switch (sort) {
    case "recently-attempted":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.lastAttemptedAt, "desc"));
      break;
    case "least-recently-attempted":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.lastAttemptedAt, "asc"));
      break;
    case "newest-exam-year":
      arr.sort((a, b) => b.year - a.year);
      break;
    case "oldest-exam-year":
      arr.sort((a, b) => a.year - b.year);
      break;
    case "name-az":
      arr.sort((a, b) =>
        (ctx.subjectNameById.get(a.subjectId) ?? "").localeCompare(ctx.subjectNameById.get(b.subjectId) ?? "")
      );
      break;
    case "name-za":
      arr.sort((a, b) =>
        (ctx.subjectNameById.get(b.subjectId) ?? "").localeCompare(ctx.subjectNameById.get(a.subjectId) ?? "")
      );
      break;
    case "recently-wrong":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.lastWrongAt, "desc"));
      break;
    case "oldest-wrong":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.lastWrongAt, "asc"));
      break;
    case "most-incorrect-attempts":
      arr.sort((a, b) => (ctx.incorrectCount.get(b.id) ?? 0) - (ctx.incorrectCount.get(a.id) ?? 0));
      break;
    case "recently-bookmarked":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.bookmarkedAt, "desc"));
      break;
    case "oldest-bookmarked":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.bookmarkedAt, "asc"));
      break;
    case "recently-correct":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.lastCorrectAt, "desc"));
      break;
    case "oldest-correct":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.lastCorrectAt, "asc"));
      break;
    case "collected-recently":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.collectedAt, "desc"));
      break;
    case "collected-earliest":
      arr.sort((a, b) => compareRecency(a.id, b.id, ctx.collectedAt, "asc"));
      break;
  }
  return arr;
}
