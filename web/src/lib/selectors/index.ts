import type {
  Attempt,
  BookmarkEntry,
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

/**
 * The Revision screen's slices of wrong questions. `recentSinceDay` is a
 * `YYYY-MM-DD` string supplied by the caller (day granularity keeps the value
 * stable across renders, so it's safe to read from the clock on the client).
 */
export function getWrongQuestionFacets(
  sessions: TestSession[],
  questions: Question[],
  recentSinceDay: string | null
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
    if (recentSinceDay && latestAttempt.answeredAt.slice(0, 10) >= recentSinceDay) {
      recent.push(q);
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
