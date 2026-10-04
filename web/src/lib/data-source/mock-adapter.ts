import { EXAMS } from "@/data/mock/exams";
import { PLANS } from "@/data/mock/plans";
import { QUESTIONS } from "@/data/mock/questions";
import { SUBJECTS } from "@/data/mock/subjects";
import { TOPICS } from "@/data/mock/topics";
import { buildQuestionSortContext, sortQuestions, type QuestionSortOption } from "@/lib/question-sort";
import { DAILY_QUESTION_TARGET } from "@/lib/streak-config";
import {
  countAttemptsOnDay,
  getCorrectQuestionFacets,
  getNextUnansweredIndex,
  getQuestionStatusMap,
  getQuestionsInCollections,
  getSessionScope,
  getSessionSummary,
  getStatistics,
  getWrongQuestions,
} from "@/lib/selectors";
import { useAuthStore } from "@/store/auth-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { useCollectionsStore } from "@/store/collections-store";
import { usePracticeStore } from "@/store/practice-store";
import { useStreakStore } from "@/store/streak-store";
import type { Question, SessionFilters, TestSession } from "@/types";
import {
  NotFoundError,
  type CreateSessionInput,
  type PyqDataSource,
  type QuestionListItem,
  type QuestionQuery,
  type RevisionItem,
  type SessionDetail,
  type SessionListItem,
  type SessionOrder,
} from "./types";

/**
 * The prototype's data: static mock content plus progress persisted in the
 * browser through the existing zustand stores. Everything the screens used to
 * compute inline lives here now, behind the same port the API adapter fills.
 */

const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q] as const));

interface PersistedStore {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
}

function hydrated(store: PersistedStore): Promise<void> {
  if (typeof window === "undefined" || store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = store.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

async function ready() {
  await Promise.all([
    hydrated(usePracticeStore as unknown as PersistedStore),
    hydrated(useBookmarksStore as unknown as PersistedStore),
    hydrated(useCollectionsStore as unknown as PersistedStore),
    hydrated(useAuthStore as unknown as PersistedStore),
    hydrated(useStreakStore as unknown as PersistedStore),
  ]);
}

const sessions = () => Object.values(usePracticeStore.getState().sessions);

function sample<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function pickOrdered(
  pool: Question[],
  count: number,
  order: SessionOrder,
  statusMap: Map<string, string>,
  bookmarkedIds: Set<string>
) {
  const prioritised = (isPriority: (q: Question) => boolean) => {
    const priority = pool.filter(isPriority);
    const rest = pool.filter((q) => !isPriority(q));
    const first = sample(priority, Math.min(count, priority.length));
    const remaining = count - first.length;
    return remaining > 0 ? [...first, ...sample(rest, remaining)] : first;
  };
  if (order === "unattempted-first") return prioritised((q) => !statusMap.has(q.id));
  if (order === "incorrect-first") return prioritised((q) => statusMap.get(q.id) === "incorrect");
  if (order === "bookmarked-first") return prioritised((q) => bookmarkedIds.has(q.id));
  return sample(pool, Math.min(count, pool.length));
}

function filterQuestions(query: QuestionQuery): Question[] {
  const all = sessions();
  const statusMap = getQuestionStatusMap(all);
  const bookmarkedIds = new Set(useBookmarksStore.getState().bookmarks.map((b) => b.questionId));
  const has = <T,>(list: T[] | undefined, value: T) => !list?.length || list.includes(value);
  const needle = query.search?.trim().toLowerCase();

  let results = QUESTIONS.filter(
    (q) =>
      has(query.examIds, q.examId) &&
      has(query.years, q.year) &&
      has(query.subjectIds, q.subjectId) &&
      has(query.topicIds, q.topicId) &&
      (!needle || q.stem.toLowerCase().includes(needle))
  );
  results = getQuestionsInCollections(
    useCollectionsStore.getState().collections,
    query.collectionIds ?? [],
    results
  );
  if (query.status === "bookmarked") results = results.filter((q) => bookmarkedIds.has(q.id));
  else if (query.status) results = results.filter((q) => (statusMap.get(q.id) ?? "unattempted") === query.status);
  return results;
}

function toDetail(session: TestSession): SessionDetail {
  return {
    session,
    questions: session.questionIds
      .map((id) => QUESTION_BY_ID.get(id))
      .filter((q): q is Question => Boolean(q)),
    submitted: Boolean(session.completedAt),
  };
}

function requireSession(sessionId: string): TestSession {
  const session = usePracticeStore.getState().sessions[sessionId];
  if (!session) throw new NotFoundError("Session not found");
  return session;
}

function toSessionFilters(query?: QuestionQuery): SessionFilters | undefined {
  if (!query) return undefined;
  const pick = <T,>(list?: T[]) => (list?.length ? list : undefined);
  return {
    examIds: pick(query.examIds),
    years: pick(query.years),
    subjectIds: pick(query.subjectIds),
    topicIds: pick(query.topicIds),
    collectionIds: pick(query.collectionIds),
  };
}

function requireCollection(id: string) {
  const collection = useCollectionsStore.getState().collections.find((c) => c.id === id);
  if (!collection) throw new NotFoundError("Collection not found");
  return collection;
}

function buildRevisionItems(): RevisionItem[] {
  const all = sessions();
  const facts = new Map<
    string,
    { attempts: number; incorrect: number; lastAt?: string; lastCorrectAt?: string; lastWrongAt?: string; latestCorrect?: boolean; flagged: boolean }
  >();
  const factFor = (id: string) => {
    let entry = facts.get(id);
    if (!entry) facts.set(id, (entry = { attempts: 0, incorrect: 0, flagged: false }));
    return entry;
  };
  for (const session of all) {
    for (const [questionId, flagged] of Object.entries(session.flags)) if (flagged) factFor(questionId).flagged = true;
    for (const attempt of Object.values(session.attempts)) {
      const entry = factFor(attempt.questionId);
      entry.attempts += 1;
      if (!entry.lastAt || attempt.answeredAt > entry.lastAt) {
        entry.lastAt = attempt.answeredAt;
        entry.latestCorrect = attempt.isCorrect;
      }
      if (attempt.isCorrect) {
        if (!entry.lastCorrectAt || attempt.answeredAt > entry.lastCorrectAt) entry.lastCorrectAt = attempt.answeredAt;
      } else {
        entry.incorrect += 1;
        if (!entry.lastWrongAt || attempt.answeredAt > entry.lastWrongAt) entry.lastWrongAt = attempt.answeredAt;
      }
    }
  }
  const bookmarkedAt = new Map(useBookmarksStore.getState().bookmarks.map((b) => [b.questionId, b.createdAt] as const));
  const collectedAt = new Map<string, string>();
  for (const c of useCollectionsStore.getState().collections) {
    for (const id of c.questionIds) {
      const prev = collectedAt.get(id);
      if (!prev || c.createdAt > prev) collectedAt.set(id, c.createdAt);
    }
  }
  const staleBefore = new Date(Date.now() - REVISION_STALE_DAYS * 86_400_000).toISOString();
  const ids = new Set([...facts.keys(), ...bookmarkedAt.keys(), ...collectedAt.keys()]);
  return [...ids].flatMap((id) => {
    const question = QUESTION_BY_ID.get(id);
    if (!question) return [];
    const f = facts.get(id);
    const latestCorrect = f?.latestCorrect ?? null;
    const flagged = f?.flagged ?? false;
    return [
      {
        question,
        latestCorrect,
        lastAttemptedAt: f?.lastAt,
        lastCorrectAt: f?.lastCorrectAt,
        lastWrongAt: f?.lastWrongAt,
        attemptCount: f?.attempts ?? 0,
        incorrectCount: f?.incorrect ?? 0,
        neverCorrected: Boolean(f && f.attempts > 0 && !f.lastCorrectAt),
        flagged,
        bookmarkedAt: bookmarkedAt.get(id),
        collectedAt: collectedAt.get(id),
        due: latestCorrect === false || flagged || (latestCorrect === true && (f?.lastAt ?? "") < staleBefore),
      },
    ];
  });
}

/** Mirrors the backend's REVISION_STALE_DAYS. */
const REVISION_STALE_DAYS = 30;

export const mockDataSource: PyqDataSource = {
  kind: "mock",
  capabilities: { search: true, sort: true, collections: true, sessionOrdering: true },

  async getTaxonomy() {
    const counts = new Map<string, number>();
    for (const q of QUESTIONS) counts.set(q.subjectId, (counts.get(q.subjectId) ?? 0) + 1);
    return {
      exams: EXAMS,
      subjects: SUBJECTS.map((s) => ({ ...s, questionCount: counts.get(s.id) ?? 0 })),
      topics: TOPICS,
    };
  },

  async getAccess() {
    return { subscribed: true, dailyLimit: null, usedToday: 0, remainingToday: null, plan: null };
  },

  // Plans in mock mode are the illustrative PLANS; "buying" one just relabels
  // the profile, exactly as the mock subscription page always has.
  async listPlans() {
    return PLANS.filter((p) => p.priceMonthly > 0).map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      price: p.priceMonthly,
      currency: "INR",
      durationDays: 30,
      period: "month",
      popular: Boolean(p.highlight),
      features: p.entitlements.features,
    }));
  },

  async startPlanCheckout(planId: string) {
    useAuthStore.getState().upgradePlan(planId);
    return { kind: "FREE" as const };
  },

  async confirmPayment() {},

  async simulatePayment() {
    return true;
  },

  async listQuestions(query, page, pageSize) {
    await ready();
    const all = sessions();
    const statusMap = getQuestionStatusMap(all);
    const bookmarks = useBookmarksStore.getState().bookmarks;
    const bookmarkedIds = new Set(bookmarks.map((b) => b.questionId));
    let results = filterQuestions(query);
    if (query.sort) {
      const ctx = buildQuestionSortContext(all, bookmarks, useCollectionsStore.getState().collections, SUBJECTS);
      results = sortQuestions(results, query.sort as QuestionSortOption, ctx);
    }
    const items: QuestionListItem[] = results
      .slice((page - 1) * pageSize, page * pageSize)
      .map((q) => ({ ...q, bookmarked: bookmarkedIds.has(q.id), userStatus: statusMap.get(q.id) ?? "unattempted" }));
    return { items, total: results.length, page, pageSize };
  },

  async reportQuestion() {
    // No content team behind the mock — the toast is the whole workflow.
  },

  async createSession(input: CreateSessionInput) {
    await ready();
    let questionIds = input.questionIds;
    if (!questionIds) {
      const statusMap = getQuestionStatusMap(sessions());
      const bookmarkedIds = new Set(useBookmarksStore.getState().bookmarks.map((b) => b.questionId));
      const pool = filterQuestions(input.filters ?? {});
      questionIds = pickOrdered(pool, input.count ?? 20, input.order ?? "random", statusMap, bookmarkedIds).map(
        (q) => q.id
      );
    }
    if (questionIds.length === 0) throw new Error("No questions match this selection");
    return usePracticeStore.getState().createSession({
      mode: input.mode,
      label: input.label,
      questionIds,
      filters: toSessionFilters(input.filters),
      timed: input.timed,
      durationSec: input.durationSec,
      sourceHref: input.sourceHref,
    });
  },

  async listSessions(page, pageSize) {
    await ready();
    const sorted = sessions().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const items: SessionListItem[] = sorted.slice((page - 1) * pageSize, page * pageSize).map((session) => {
      const summary = getSessionSummary(session, QUESTIONS);
      const years = session.questionIds
        .map((id) => QUESTION_BY_ID.get(id)?.year)
        .filter((y): y is number => y !== undefined);
      const wrongTimes = Object.values(session.attempts)
        .filter((a) => !a.isCorrect)
        .map((a) => a.answeredAt)
        .sort();
      const scope = getSessionScope(session, QUESTIONS);
      return {
        session,
        submitted: Boolean(session.completedAt),
        examIds: scope.examIds,
        subjectIds: scope.subjectIds,
        resumeIndex: getNextUnansweredIndex(session),
        totalQuestions: summary.totalQuestions,
        attempted: summary.attempted,
        correct: summary.correct,
        incorrect: summary.incorrect,
        unattempted: summary.unattempted,
        accuracy: summary.accuracy,
        totalTimeSec: summary.totalTimeSec,
        newestYear: years.length ? Math.max(...years) : undefined,
        oldestYear: years.length ? Math.min(...years) : undefined,
        lastWrongAt: wrongTimes[wrongTimes.length - 1],
      };
    });
    return { items, total: sorted.length, page, pageSize };
  },

  async getSession(sessionId) {
    await ready();
    return toDetail(requireSession(sessionId));
  },

  async answer(sessionId, questionId, optionId, timeSpentMs) {
    await ready();
    const session = requireSession(sessionId);
    const question = QUESTION_BY_ID.get(questionId);
    if (!question) throw new NotFoundError("Question not found");
    const existing = session.attempts[questionId];
    const selected = existing?.selectedOptionId ?? optionId;
    const isCorrect = selected === question.correctOptionId;
    if (!existing) {
      usePracticeStore
        .getState()
        .submitAnswer(sessionId, questionId, selected, isCorrect, Math.max(1, Math.round(timeSpentMs / 1000)));
    }
    return {
      questionId,
      selectedOptionId: selected,
      isCorrect,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
      explanationFigure: question.explanationFigure,
    };
  },

  async setFlag(sessionId, questionId, flagged) {
    await ready();
    if (Boolean(requireSession(sessionId).flags[questionId]) !== flagged) {
      usePracticeStore.getState().toggleFlag(sessionId, questionId);
    }
  },

  async submitSession(sessionId) {
    await ready();
    requireSession(sessionId);
    usePracticeStore.getState().finishSession(sessionId);
    return toDetail(requireSession(sessionId));
  },

  async getReview(sessionId) {
    await ready();
    return toDetail(requireSession(sessionId));
  },

  async listBookmarks() {
    await ready();
    const statusMap = getQuestionStatusMap(sessions());
    return useBookmarksStore.getState().bookmarks.flatMap((b) => {
      const question = QUESTION_BY_ID.get(b.questionId);
      return question
        ? [{ questionId: b.questionId, createdAt: b.createdAt, question, userStatus: statusMap.get(question.id) ?? "unattempted" }]
        : [];
    });
  },

  async setBookmark(questionId, bookmarked) {
    await ready();
    const store = useBookmarksStore.getState();
    if (store.isBookmarked(questionId) !== bookmarked) store.toggleBookmark(questionId);
  },

  async listWrongQuestions() {
    await ready();
    return getWrongQuestions(sessions(), QUESTIONS);
  },

  async getStats() {
    await ready();
    return getStatistics(sessions(), QUESTIONS, useBookmarksStore.getState().bookmarks);
  },

  async listCollections() {
    await ready();
    return [...useCollectionsStore.getState().collections].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createCollection(input) {
    await ready();
    return useCollectionsStore.getState().createCollection(input);
  },

  async updateCollection(id, patch) {
    await ready();
    requireCollection(id);
    useCollectionsStore.getState().updateCollection(id, patch);
    return requireCollection(id);
  },

  async deleteCollection(id) {
    await ready();
    requireCollection(id);
    useCollectionsStore.getState().deleteCollection(id);
  },

  async setCollectionMembership(collectionId, questionId, member) {
    await ready();
    if (requireCollection(collectionId).questionIds.includes(questionId) !== member) {
      useCollectionsStore.getState().toggleQuestionInCollection(collectionId, questionId);
    }
  },

  async getStreak() {
    await ready();
    const current = useAuthStore.getState().profile.streakDays;
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = countAttemptsOnDay(sessions(), today);
    return {
      currentStreak: current,
      longestStreak: Math.max(useStreakStore.getState().bestStreak, current),
      today,
      todayCount,
      dailyTarget: DAILY_QUESTION_TARGET,
      todayDone: todayCount >= DAILY_QUESTION_TARGET,
      lastActiveDay: null,
    };
  },

  async getRevision() {
    await ready();
    return buildRevisionItems();
  },

  async getReinforce(recentDays) {
    await ready();
    const since = new Date(Date.now() - recentDays * 86_400_000).toISOString().slice(0, 10);
    return getCorrectQuestionFacets(sessions(), QUESTIONS, since);
  },

  async getPreferences() {
    await ready();
    return { targetExamId: useAuthStore.getState().profile.targetExamId, dailyTarget: DAILY_QUESTION_TARGET };
  },

  async updatePreferences(patch) {
    await ready();
    if (patch.targetExamId) useAuthStore.getState().updateProfile({ targetExamId: patch.targetExamId });
    return { targetExamId: useAuthStore.getState().profile.targetExamId, dailyTarget: DAILY_QUESTION_TARGET };
  },
};
