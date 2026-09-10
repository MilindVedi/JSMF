import type {
  Attempt,
  BookmarkEntry,
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

export function getWrongQuestions(sessions: TestSession[], questions: Question[]): Question[] {
  const latest = getLatestAttemptByQuestion(sessions);
  const wrongIds = new Set<string>();
  for (const [questionId, attempt] of latest) {
    if (!attempt.isCorrect) wrongIds.add(questionId);
  }
  return questions.filter((q) => wrongIds.has(q.id));
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

  const accuracyTrend = completedSessions.map((s) => {
    const attempts = Object.values(s.attempts);
    const c = attempts.filter((a) => a.isCorrect).length;
    return {
      date: s.completedAt!,
      accuracy: attempts.length > 0 ? Math.round((c / attempts.length) * 100) : 0,
    };
  });

  return {
    totalQuestions,
    attempted,
    correct,
    incorrect,
    unattempted,
    accuracy,
    bySubject,
    accuracyTrend,
    wrongQuestionCount: getWrongQuestions(sessions, questions).length,
    bookmarkCount: bookmarks.length,
  };
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
