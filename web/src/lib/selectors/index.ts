import type {
  Attempt,
  BookmarkEntry,
  Collection,
  ExamId,
  OverallStatistics,
  Question,
  SessionSummary,
  SubjectPerformance,
  TestSession,
} from "@/types";

/**
 * Wrong questions and all statistics are DERIVED, not stored — computed here
 * from TestSession attempts/flags, Question content, and bookmarks. This
 * avoids a question being simultaneously "wrong" in one place and "correct"
 * in another after a user re-attempts it. See docs/05-ui-ux-plan.md.
 */

export function getLatestAttemptByQuestion(sessions: TestSession[]): Map<string, Attempt> {
  const map = new Map<string, Attempt>();
  for (const session of sessions) {
    for (const attempt of Object.values(session.attempts)) {
      const existing = map.get(attempt.questionId);
      if (!existing || new Date(attempt.answeredAt) > new Date(existing.answeredAt)) {
        map.set(attempt.questionId, attempt);
      }
    }
  }
  return map;
}

export type QuestionStatus = "correct" | "incorrect" | "unattempted";

/**
 * Per-question status based on the most recent attempt, for the status filter
 * and row indicators in the Question Bank. Questions absent from the map are
 * unattempted.
 */
export function getQuestionStatusMap(sessions: TestSession[]): Map<string, QuestionStatus> {
  const latest = getLatestAttemptByQuestion(sessions);
  const map = new Map<string, QuestionStatus>();
  for (const [questionId, attempt] of latest) {
    map.set(questionId, attempt.isCorrect ? "correct" : "incorrect");
  }
  return map;
}

/**
 * Attempts answered on a given calendar day, for the dashboard's daily-progress
 * widget. Takes the day as a `YYYY-MM-DD` string so this stays a pure function
 * and the caller owns reading the clock.
 */
export function countAttemptsOnDay(sessions: TestSession[], dayISO: string): number {
  let count = 0;
  for (const session of sessions) {
    for (const attempt of Object.values(session.attempts)) {
      if (attempt.answeredAt.slice(0, 10) === dayISO) count += 1;
    }
  }
  return count;
}

/**
 * What a session actually covers, so the dashboard can describe the last
 * activity concretely ("NEET-PG · Pharmacology · 20 questions") instead of
 * just naming its mode.
 */
export function getSessionScope(
  session: TestSession,
  questions: Question[]
): { examIds: ExamId[]; subjectIds: string[]; questionCount: number; answeredCount: number } {
  const questionMap = new Map(questions.map((q) => [q.id, q] as const));
  const sessionQuestions = session.questionIds
    .map((id) => questionMap.get(id))
    .filter((q): q is Question => Boolean(q));

  return {
    examIds: Array.from(new Set(sessionQuestions.map((q) => q.examId))),
    subjectIds: Array.from(new Set(sessionQuestions.map((q) => q.subjectId))),
    questionCount: session.questionIds.length,
    answeredCount: Object.keys(session.attempts).length,
  };
}

/**
 * The index to resume a session at: the first question with no attempt yet,
 * not just `answeredCount` (a plain count would be wrong the moment a
 * question is answered out of order, e.g. via the palette or Previous/Next).
 * Falls back to 0 if every question already has an attempt.
 */
export function getNextUnansweredIndex(session: TestSession): number {
  const index = session.questionIds.findIndex((id) => !session.attempts[id]);
  return index === -1 ? 0 : index;
}

export function getWrongQuestions(sessions: TestSession[], questions: Question[]): Question[] {
  const latest = getLatestAttemptByQuestion(sessions);
  const wrongIds = new Set<string>();
  for (const [questionId, attempt] of latest) {
    if (!attempt.isCorrect) wrongIds.add(questionId);
  }
  return questions.filter((q) => wrongIds.has(q.id));
}

export interface WrongQuestionFacets {
  /** Latest attempt was incorrect. */
  all: Question[];
  /** Got it wrong within the recency window. */
  recent: Question[];
  /** Attempted at least once and never answered correctly in any attempt —
   *  a stricter, more useful revision set than "latest attempt wrong". */
  neverCorrected: Question[];
  bySubject: { subjectId: string; questions: Question[] }[];
}

export interface DayRange {
  /** Inclusive `YYYY-MM-DD` lower bound, or `null` for no lower bound. */
  from: string | null;
  /** Inclusive `YYYY-MM-DD` upper bound, or `null`/omitted for no upper bound
   *  (i.e. up to now) — lets a preset window ("last 7 days") and an explicit
   *  custom range ("from X to Y") share the same shape. */
  to?: string | null;
}

/**
 * The Revision screen's slices of wrong questions. `recentRange` bounds the
 * `recent` slice by the latest attempt's day, supplied by the caller (day
 * granularity keeps the value stable across renders, so it's safe to read
 * from the clock on the client).
 */
export function getWrongQuestionFacets(
  sessions: TestSession[],
  questions: Question[],
  recentRange: DayRange | null
): WrongQuestionFacets {
  const attemptsByQuestion = new Map<string, Attempt[]>();
  for (const session of sessions) {
    for (const attempt of Object.values(session.attempts)) {
      const list = attemptsByQuestion.get(attempt.questionId);
      if (list) list.push(attempt);
      else attemptsByQuestion.set(attempt.questionId, [attempt]);
    }
  }

  const latest = getLatestAttemptByQuestion(sessions);
  const all: Question[] = [];
  const recent: Question[] = [];
  const neverCorrected: Question[] = [];

  for (const q of questions) {
    const latestAttempt = latest.get(q.id);
    if (!latestAttempt || latestAttempt.isCorrect) continue;

    all.push(q);
    if (recentRange) {
      const day = latestAttempt.answeredAt.slice(0, 10);
      const afterFrom = !recentRange.from || day >= recentRange.from;
      const beforeTo = !recentRange.to || day <= recentRange.to;
      if (afterFrom && beforeTo) recent.push(q);
    }
    const attempts = attemptsByQuestion.get(q.id) ?? [];
    if (attempts.length > 0 && attempts.every((a) => !a.isCorrect)) {
      neverCorrected.push(q);
    }
  }

  const bySubjectMap = new Map<string, Question[]>();
  for (const q of all) {
    const list = bySubjectMap.get(q.subjectId);
    if (list) list.push(q);
    else bySubjectMap.set(q.subjectId, [q]);
  }

  return {
    all,
    recent,
    neverCorrected,
    bySubject: Array.from(bySubjectMap.entries())
      .map(([subjectId, qs]) => ({ subjectId, questions: qs }))
      .sort((a, b) => b.questions.length - a.questions.length),
  };
}

export interface CorrectQuestionFacets {
  /** Latest attempt was correct. */
  all: Question[];
  /** Answered correctly within the recency window. */
  recent: Question[];
  /** Answered correctly, but that attempt is older than the recency window
   *  — i.e. not looked at again since. The most useful slice for turning
   *  "correct" into an actual revision feature rather than a copy of
   *  History: it surfaces questions worth reinforcing specifically because
   *  they haven't been revisited, not just because they exist. */
  notRevisited: Question[];
}

/**
 * The Revision screen's "Reinforce" slices — the mirror of
 * `getWrongQuestionFacets` for questions a student already gets right, so
 * revision covers reinforcing knowledge as well as fixing mistakes.
 * `recentSinceDay` is a `YYYY-MM-DD` string, same convention as above.
 */
export function getCorrectQuestionFacets(
  sessions: TestSession[],
  questions: Question[],
  recentSinceDay: string | null
): CorrectQuestionFacets {
  const latest = getLatestAttemptByQuestion(sessions);
  const all: Question[] = [];
  const recent: Question[] = [];
  const notRevisited: Question[] = [];

  for (const q of questions) {
    const latestAttempt = latest.get(q.id);
    if (!latestAttempt || !latestAttempt.isCorrect) continue;

    all.push(q);
    const isRecent = Boolean(recentSinceDay && latestAttempt.answeredAt.slice(0, 10) >= recentSinceDay);
    if (isRecent) {
      recent.push(q);
    } else {
      notRevisited.push(q);
    }
  }

  return { all, recent, notRevisited };
}

export function getStatistics(
  sessions: TestSession[],
  questions: Question[],
  bookmarks: BookmarkEntry[]
): OverallStatistics {
  const latest = getLatestAttemptByQuestion(sessions);
  const totalQuestions = questions.length;

  let correct = 0;
  let incorrect = 0;
  const bySubjectMap = new Map<string, { attempted: number; correct: number; incorrect: number }>();

  for (const q of questions) {
    const attempt = latest.get(q.id);
    if (!attempt) continue;
    const bucket = bySubjectMap.get(q.subjectId) ?? { attempted: 0, correct: 0, incorrect: 0 };
    bucket.attempted += 1;
    if (attempt.isCorrect) {
      correct += 1;
      bucket.correct += 1;
    } else {
      incorrect += 1;
      bucket.incorrect += 1;
    }
    bySubjectMap.set(q.subjectId, bucket);
  }

  const attempted = correct + incorrect;
  const unattempted = totalQuestions - attempted;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  const bySubject: SubjectPerformance[] = Array.from(bySubjectMap.entries())
    .map(([subjectId, v]) => ({
      subjectId,
      attempted: v.attempted,
      correct: v.correct,
      incorrect: v.incorrect,
      accuracy: v.attempted > 0 ? Math.round((v.correct / v.attempted) * 100) : 0,
    }))
    .sort((a, b) => b.attempted - a.attempted);

  const completedSessions = sessions
    .filter((s) => s.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

  const allAttemptsByTime = sessions
    .flatMap((s) => Object.values(s.attempts))
    .sort((a, b) => new Date(a.answeredAt).getTime() - new Date(b.answeredAt).getTime());

  const accuracyTrend = completedSessions.map((s) => {
    const attempts = Object.values(s.attempts);
    const c = attempts.filter((a) => a.isCorrect).length;
    const cutoff = new Date(s.completedAt!).getTime();
    const upTo = allAttemptsByTime.filter((a) => new Date(a.answeredAt).getTime() <= cutoff);
    const cumulativeCorrect = upTo.filter((a) => a.isCorrect).length;
    return {
      date: s.completedAt!,
      accuracy: attempts.length > 0 ? Math.round((c / attempts.length) * 100) : 0,
      cumulativeAccuracy: upTo.length > 0 ? Math.round((cumulativeCorrect / upTo.length) * 100) : 0,
    };
  });

  return {
    totalQuestions,
    attempted,
    correct,
    incorrect,
    unattempted,
    accuracy,
    coverage: totalQuestions > 0 ? Math.round((attempted / totalQuestions) * 100) : 0,
    bySubject,
    accuracyTrend,
    wrongQuestionCount: getWrongQuestions(sessions, questions).length,
    bookmarkCount: bookmarks.length,
  };
}

export interface SubjectCoverage {
  subjectId: string;
  total: number;
  attempted: number;
  coverage: number; // 0-100
}

/**
 * Per-subject coverage — how much of *that subject's* slice of the bank has
 * been seen at least once, unlike `getStatistics().bySubject` which only
 * lists subjects with at least one attempt (fine for an accuracy chart, but
 * coverage specifically needs to surface subjects still at 0% too). Sorted
 * least-covered first, since that's the more actionable reading for a
 * "what haven't I touched yet" breakdown.
 */
export function getSubjectCoverage(sessions: TestSession[], questions: Question[]): SubjectCoverage[] {
  const latest = getLatestAttemptByQuestion(sessions);
  const totals = new Map<string, number>();
  const attempted = new Map<string, number>();

  for (const q of questions) {
    totals.set(q.subjectId, (totals.get(q.subjectId) ?? 0) + 1);
    if (latest.has(q.id)) attempted.set(q.subjectId, (attempted.get(q.subjectId) ?? 0) + 1);
  }

  return Array.from(totals.entries())
    .map(([subjectId, total]) => {
      const att = attempted.get(subjectId) ?? 0;
      return { subjectId, total, attempted: att, coverage: total > 0 ? Math.round((att / total) * 100) : 0 };
    })
    .sort((a, b) => a.coverage - b.coverage);
}

/**
 * Per-subject breakdown for a single session, used on the results screen when
 * a session spans more than one subject — the overall percentage hides which
 * subject actually dragged the score down.
 */
export function getSessionSubjectPerformance(
  session: TestSession,
  questions: Question[]
): SubjectPerformance[] {
  const questionMap = new Map(questions.map((q) => [q.id, q] as const));
  const bySubject = new Map<string, { attempted: number; correct: number; incorrect: number }>();

  for (const questionId of session.questionIds) {
    const question = questionMap.get(questionId);
    const attempt = session.attempts[questionId];
    if (!question || !attempt) continue;

    const bucket = bySubject.get(question.subjectId) ?? { attempted: 0, correct: 0, incorrect: 0 };
    bucket.attempted += 1;
    if (attempt.isCorrect) bucket.correct += 1;
    else bucket.incorrect += 1;
    bySubject.set(question.subjectId, bucket);
  }

  return Array.from(bySubject.entries())
    .map(([subjectId, v]) => ({
      subjectId,
      attempted: v.attempted,
      correct: v.correct,
      incorrect: v.incorrect,
      accuracy: v.attempted > 0 ? Math.round((v.correct / v.attempted) * 100) : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

export function getSessionSummary(session: TestSession, questions: Question[]): SessionSummary {
  const questionMap = new Map(questions.map((q) => [q.id, q] as const));
  const sessionQuestions = session.questionIds
    .map((id) => questionMap.get(id))
    .filter((q): q is Question => Boolean(q));

  const attempts = Object.values(session.attempts);
  const correct = attempts.filter((a) => a.isCorrect).length;
  const incorrect = attempts.length - correct;
  const attempted = attempts.length;
  const unattempted = sessionQuestions.length - attempted;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
  const totalTimeSec = attempts.reduce((sum, a) => sum + a.timeSpentSec, 0);

  return {
    session,
    totalQuestions: sessionQuestions.length,
    attempted,
    correct,
    incorrect,
    unattempted,
    accuracy,
    totalTimeSec,
  };
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface CollectionStats {
  /** Unique questions across every collection — a question in two
   *  collections is only counted once, matching how the stat tile phrases it
   *  ("N questions across M collections", not "N total slots"). */
  totalQuestions: number;
  collectionCount: number;
}

export function getCollectionStats(collections: Collection[]): CollectionStats {
  const unique = new Set<string>();
  for (const c of collections) {
    for (const id of c.questionIds) unique.add(id);
  }
  return { totalQuestions: unique.size, collectionCount: collections.length };
}

/**
 * Restricts `questions` to the union of the given collections' questions —
 * matching the "empty selection = unfiltered" convention used by every other
 * filter dimension (Exam, Subject, ...): an empty `selectedCollectionIds`
 * means "no collection restriction," returning `questions` untouched, NOT
 * "the union of every collection." A caller that wants "all collections" as
 * an explicit pool (e.g. Revision's Collections section, where browsing by
 * collection is the whole point) should pass every collection id itself
 * rather than relying on this function to infer that from an empty array.
 */
export function getQuestionsInCollections(
  collections: Collection[],
  selectedCollectionIds: string[],
  questions: Question[]
): Question[] {
  if (selectedCollectionIds.length === 0) return questions;
  const idSet = new Set<string>();
  for (const c of collections) {
    if (!selectedCollectionIds.includes(c.id)) continue;
    for (const id of c.questionIds) idSet.add(id);
  }
  return questions.filter((q) => idSet.has(q.id));
}
