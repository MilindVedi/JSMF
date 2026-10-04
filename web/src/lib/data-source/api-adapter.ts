import { api, ApiError } from "@/lib/api/client";
import type {
  Attempt,
  Collection,
  ExamId,
  OverallStatistics,
  PublicQuestion,
  QuestionFigure,
  SessionMode,
  SessionQuestion,
  SubjectGroup,
  TestSession,
} from "@/types";
import {
  DailyLimitError,
  NotFoundError,
  type AnswerResult,
  type CreateSessionInput,
  type Page,
  type PlanCheckout,
  type PyqAccess,
  type PyqPlan,
  type PyqDataSource,
  type PyqPreferences,
  type RevisionItem,
  type StreakSummary,
  type QuestionListItem,
  type QuestionQuery,
  type QuestionUserStatus,
  type SessionDetail,
  type SessionListItem,
  type Taxonomy,
} from "./types";

/**
 * The NestJS backend (backend/src/modules/questions). Wire shapes are declared
 * here, next to the only code that reads them, and translated to the UI's
 * types so screens never see the difference between mock and API.
 */

// --- Wire shapes ---------------------------------------------------------------

interface WirePlan {
  id: string;
  title: string;
  subtitle: string | null;
  priceAmountMinor: string;
  currency: string;
  durationDays: number;
  period: string | null;
  popular: boolean;
  features: string[];
}

interface WireCheckout {
  kind: "FREE" | "PAYMENT_REQUIRED";
  orderId: string;
  amountMinor?: string | number;
  currency?: string;
  providerOrderId?: string;
  checkoutKeyId?: string;
}

interface WireQuestion {
  id: string;
  externalKey: string;
  examId: string;
  year: number;
  subjectId: string;
  topicId: string | null;
  stem: string;
  stemImageUrl: string | null;
  stemFigure: unknown;
  options: { id: string; label: string; text: string; imageUrl: string | null }[];
  difficulty: "easy" | "medium" | "hard";
  correctOptionId?: string | null;
  explanation?: string;
  explanationFigure?: unknown;
}

interface WireAttempt {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect?: boolean | null;
  timeSpentMs: number;
  flagged: boolean;
  answeredAt: string | null;
}

interface WireSessionSummary {
  id: string;
  mode: "PRACTICE" | "TEST" | string;
  label: string;
  config: Record<string, unknown> | null;
  timeLimitSec: number | null;
  status: "IN_PROGRESS" | "SUBMITTED";
  startedAt: string;
  submittedAt: string | null;
  totalQuestions: number;
  attempted: number;
  correct?: number;
  incorrect?: number;
  unattempted: number;
  accuracy?: number;
  totalTimeSec: number;
}

interface WireSession extends WireSessionSummary {
  questions: WireQuestion[];
  attempts: Record<string, WireAttempt>;
}

interface WirePage<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

// --- Translation ---------------------------------------------------------------

const SESSION_MODES: SessionMode[] = ["browse", "custom-test", "bookmarks", "wrong-questions"];
const MAX_SESSION_QUESTIONS = 200;

function toFigure(value: unknown): QuestionFigure | undefined {
  if (value && typeof value === "object" && "kind" in value && "caption" in value) {
    return value as QuestionFigure;
  }
  return undefined;
}

function toQuestion(wire: WireQuestion): SessionQuestion {
  const question: SessionQuestion = {
    id: wire.id,
    examId: wire.examId as ExamId,
    year: wire.year,
    subjectId: wire.subjectId,
    topicId: wire.topicId ?? "",
    stem: wire.stem,
    stemFigure: toFigure(wire.stemFigure),
    options: wire.options.map((o) => ({ id: o.id, text: o.text, imageUrl: o.imageUrl ?? undefined })),
    difficulty: wire.difficulty,
  };
  if (wire.correctOptionId) {
    question.correctOptionId = wire.correctOptionId;
    question.explanation = wire.explanation;
    question.explanationFigure = toFigure(wire.explanationFigure);
  }
  return question;
}

function toPublicQuestion(wire: WireQuestion): PublicQuestion {
  const { correctOptionId: _c, explanation: _e, explanationFigure: _f, ...rest } = toQuestion(wire);
  void _c;
  void _e;
  void _f;
  return rest;
}

function uiMode(config: Record<string, unknown> | null): SessionMode {
  const mode = config?.uiMode;
  return SESSION_MODES.includes(mode as SessionMode) ? (mode as SessionMode) : "browse";
}

function toTestSession(wire: WireSessionSummary, questions: WireQuestion[] = [], attempts: Record<string, WireAttempt> = {}): TestSession {
  const answered: Record<string, Attempt> = {};
  const flags: Record<string, boolean> = {};
  for (const attempt of Object.values(attempts)) {
    if (attempt.flagged) flags[attempt.questionId] = true;
    if (attempt.answeredAt && attempt.selectedOptionId) {
      answered[attempt.questionId] = {
        questionId: attempt.questionId,
        selectedOptionId: attempt.selectedOptionId,
        isCorrect: Boolean(attempt.isCorrect),
        timeSpentSec: Math.round(attempt.timeSpentMs / 1000),
        answeredAt: attempt.answeredAt,
      };
    }
  }
  const filters = (wire.config?.filters ?? undefined) as TestSession["filters"];
  return {
    id: wire.id,
    mode: uiMode(wire.config),
    label: wire.label,
    filters,
    questionIds: questions.map((q) => q.id),
    config: {
      timed: wire.timeLimitSec != null,
      durationSec: wire.timeLimitSec ?? undefined,
      testMode: wire.mode === "TEST",
    },
    flags,
    attempts: answered,
    startedAt: wire.startedAt,
    completedAt: wire.submittedAt ?? undefined,
    sourceHref: typeof wire.config?.sourceHref === "string" ? wire.config.sourceHref : undefined,
  };
}

function toDetail(wire: WireSession): SessionDetail {
  return {
    session: toTestSession(wire, wire.questions, wire.attempts),
    questions: wire.questions.map(toQuestion),
    submitted: wire.status === "SUBMITTED",
  };
}

function toListItem(wire: WireSessionSummary): SessionListItem {
  const correct = wire.correct ?? 0;
  const incorrect = wire.incorrect ?? 0;
  const session = toTestSession(wire);
  return {
    session,
    submitted: wire.status === "SUBMITTED",
    examIds: session.filters?.examIds ?? [],
    subjectIds: session.filters?.subjectIds ?? [],
    resumeIndex: Math.min(wire.attempted, Math.max(wire.totalQuestions - 1, 0)),
    totalQuestions: wire.totalQuestions,
    attempted: wire.attempted,
    correct,
    incorrect,
    unattempted: wire.unattempted,
    accuracy: wire.accuracy ?? 0,
    totalTimeSec: wire.totalTimeSec,
  };
}

function csv(list?: (string | number)[]) {
  return list?.length ? list.join(",") : undefined;
}

/** Only the filters the backend understands — it rejects unknown fields. */
function wireFilters(query: QuestionQuery = {}) {
  const filters: Record<string, unknown> = {};
  if (query.examIds?.length) filters.examIds = query.examIds;
  if (query.subjectIds?.length) filters.subjectIds = query.subjectIds;
  if (query.topicIds?.length) filters.topicIds = query.topicIds;
  if (query.years?.length) filters.years = query.years;
  if (query.status) filters.status = query.status;
  if (query.collectionIds?.length) filters.collectionIds = query.collectionIds;
  return filters;
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Domain errors the screens handle specially; everything else passes through. */
async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { code?: string; message?: string; dailyLimit?: number } | undefined;
      if (error.status === 403 && body?.code === "PYQ_DAILY_LIMIT_REACHED") {
        throw new DailyLimitError(body.message ?? error.message, body.dailyLimit ?? null);
      }
      if (error.status === 404) throw new NotFoundError(error.message);
    }
    throw error;
  }
}

interface WireCollection {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  questionIds: string[];
}

function toCollection(wire: WireCollection): Collection {
  return {
    id: wire.id,
    name: wire.name,
    description: wire.description ?? undefined,
    questionIds: wire.questionIds,
    createdAt: wire.createdAt,
  };
}

interface WireRevisionItem {
  question: WireQuestion;
  latestCorrect: boolean | null;
  lastAttemptedAt: string | null;
  lastCorrectAt: string | null;
  lastWrongAt: string | null;
  attemptCount: number;
  incorrectCount: number;
  neverCorrected: boolean;
  flagged: boolean;
  bookmarkedAt: string | null;
  collectedAt: string | null;
  due: boolean;
}

// --- Adapter -------------------------------------------------------------------

export const apiDataSource: PyqDataSource = {
  kind: "api",
  capabilities: { search: false, sort: false, collections: true, sessionOrdering: false },

  getTaxonomy: () =>
    call(async () => {
      const wire = await api.getAnonymous<{
        exams: { id: string; name: string; shortName: string | null; description: string | null }[];
        subjects: {
          id: string;
          slug: string;
          name: string;
          group: string;
          description: string | null;
          questionCount: number;
        }[];
        topics: { id: string; subjectId: string; name: string }[];
      }>("/pyq/taxonomy");
      const taxonomy: Taxonomy = {
        exams: wire.exams.map((e) => ({
          id: e.id as ExamId,
          name: e.name,
          shortName: e.shortName ?? e.name,
          description: e.description ?? "",
        })),
        subjects: wire.subjects.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          group: s.group as SubjectGroup,
          description: s.description ?? undefined,
          questionCount: s.questionCount,
        })),
        topics: wire.topics,
      };
      return taxonomy;
    }),

  getAccess: () => call(() => api.get<PyqAccess>("/pyq/access")),

  listPlans: () =>
    call(async () => {
      const wire = await api.get<WirePlan[]>("/pyq/plans");
      return wire.map(
        (p): PyqPlan => ({
          id: p.id,
          name: p.title,
          tagline: p.subtitle,
          price: Number(p.priceAmountMinor) / 100,
          currency: p.currency,
          durationDays: p.durationDays,
          period: p.period,
          popular: p.popular,
          features: p.features,
        })
      );
    }),

  startPlanCheckout: (planId) =>
    call(async () => {
      const order = await api.post<WireCheckout>("/orders", { productId: planId });
      const result: PlanCheckout =
        order.kind === "FREE"
          ? { kind: "FREE" }
          : {
              kind: "PAYMENT_REQUIRED",
              orderId: order.orderId,
              amountMinor: String(order.amountMinor),
              currency: order.currency ?? "INR",
              providerOrderId: order.providerOrderId ?? "",
              checkoutKeyId: order.checkoutKeyId ?? "",
            };
      return result;
    }),

  confirmPayment: (payment) =>
    call(async () => {
      await api.post("/payments/verify", payment);
    }),

  simulatePayment: (orderId) =>
    call(async () => {
      const result = await api.post<{ success?: boolean }>(`/orders/${orderId}/simulate-payment`, {
        outcome: "success",
      });
      return result?.success !== false;
    }),

  listQuestions: (query, page, pageSize) =>
    call(async () => {
      const wire = await api.get<WirePage<WireQuestion & { bookmarked: boolean; userStatus: QuestionUserStatus }>>(
        `/pyq/questions${queryString({
          examIds: csv(query.examIds),
          subjectIds: csv(query.subjectIds),
          topicIds: csv(query.topicIds),
          years: csv(query.years),
          status: query.status,
          collectionIds: csv(query.collectionIds),
          page,
          pageSize,
        })}`
      );
      const result: Page<QuestionListItem> = {
        ...wire,
        items: wire.items.map((item) => ({
          ...toPublicQuestion(item),
          bookmarked: item.bookmarked,
          userStatus: item.userStatus,
        })),
      };
      return result;
    }),

  reportQuestion: (questionId, reason, details) =>
    call(async () => {
      await api.post(`/pyq/questions/${questionId}/reports`, { reason, details: details || undefined });
    }),

  createSession: (input: CreateSessionInput) =>
    call(async () => {
      const body: Record<string, unknown> = {
        // A timed custom test is a real test: answers stay hidden until submit.
        // Every other UI mode shows feedback per question (PRACTICE).
        mode: input.mode === "custom-test" && input.timed ? "TEST" : "PRACTICE",
        label: input.label,
        meta: { uiMode: input.mode, ...(input.sourceHref ? { sourceHref: input.sourceHref } : {}) },
      };
      if (input.questionIds) body.questionIds = input.questionIds.slice(0, MAX_SESSION_QUESTIONS);
      else {
        body.filters = wireFilters(input.filters);
        body.count = Math.min(Math.max(input.count ?? 20, 1), MAX_SESSION_QUESTIONS);
      }
      if (input.timed && input.durationSec) body.timeLimitSec = Math.max(30, Math.round(input.durationSec));
      const session = await api.post<WireSession>("/pyq/sessions", body);
      return session.id;
    }),

  listSessions: (page, pageSize) =>
    call(async () => {
      const wire = await api.get<WirePage<WireSessionSummary>>(`/pyq/sessions${queryString({ page, pageSize })}`);
      return { ...wire, items: wire.items.map(toListItem) };
    }),

  getSession: (sessionId) => call(async () => toDetail(await api.get<WireSession>(`/pyq/sessions/${sessionId}`))),

  answer: (sessionId, questionId, optionId, timeSpentMs) =>
    call(async () => {
      const wire = await api.post<{
        questionId: string;
        selectedOptionId: string;
        isCorrect?: boolean;
        correctOptionId?: string | null;
        explanation?: string;
        explanationFigure?: unknown;
      }>(`/pyq/sessions/${sessionId}/answers`, {
        questionId,
        selectedOptionId: optionId,
        timeSpentMs: Math.max(0, Math.round(timeSpentMs)),
      });
      const result: AnswerResult = {
        questionId: wire.questionId,
        selectedOptionId: wire.selectedOptionId,
        isCorrect: Boolean(wire.isCorrect),
        correctOptionId: wire.correctOptionId ?? "",
        explanation: wire.explanation ?? "",
        explanationFigure: toFigure(wire.explanationFigure),
      };
      return result;
    }),

  setFlag: (sessionId, questionId, flagged) =>
    call(async () => {
      await api.patch(`/pyq/sessions/${sessionId}/questions/${questionId}/flag`, { flagged });
    }),

  submitSession: (sessionId) =>
    call(async () => toDetail(await api.post<WireSession>(`/pyq/sessions/${sessionId}/submit`))),

  getReview: (sessionId) => call(async () => toDetail(await api.get<WireSession>(`/pyq/sessions/${sessionId}/review`))),

  listBookmarks: () =>
    call(async () => {
      // Bookmarks carry no attempt status; the bookmarked slice of the bank does.
      const [bookmarks, statuses] = await Promise.all([
        api.get<{ questionId: string; createdAt: string; question: WireQuestion }[]>("/pyq/bookmarks"),
        api.get<WirePage<{ id: string; userStatus: QuestionUserStatus }>>("/pyq/questions?status=bookmarked&pageSize=100"),
      ]);
      const statusById = new Map(statuses.items.map((q) => [q.id, q.userStatus] as const));
      return bookmarks.map((b) => ({
        questionId: b.questionId,
        createdAt: b.createdAt,
        question: toPublicQuestion(b.question),
        userStatus: statusById.get(b.questionId),
      }));
    }),

  setBookmark: (questionId, bookmarked) =>
    call(async () => {
      if (bookmarked) await api.put(`/pyq/bookmarks/${questionId}`);
      else await api.delete(`/pyq/bookmarks/${questionId}`);
    }),

  listWrongQuestions: () =>
    call(async () => {
      const wire = await api.get<(WireQuestion & { lastAnsweredAt: string })[]>("/pyq/wrong-questions");
      return wire.map((q) => ({ ...toPublicQuestion(q), lastAnsweredAt: q.lastAnsweredAt }));
    }),

  getStats: () =>
    call(async () => {
      const wire = await api.get<OverallStatistics & { accuracyTrend: { date: string; accuracy: number; cumulativeAccuracy: number }[] }>(
        "/pyq/stats"
      );
      return {
        ...wire,
        bySubject: [...wire.bySubject].sort((a, b) => b.attempted - a.attempted),
      };
    }),

  listCollections: () =>
    call(async () => (await api.get<WireCollection[]>("/pyq/collections")).map(toCollection)),

  createCollection: (input) =>
    call(async () =>
      toCollection(
        await api.post<WireCollection>("/pyq/collections", {
          name: input.name,
          description: input.description || undefined,
          questionIds: input.questionIds?.length ? input.questionIds : undefined,
        })
      )
    ),

  updateCollection: (id, patch) =>
    call(async () => toCollection(await api.patch<WireCollection>(`/pyq/collections/${id}`, patch))),

  deleteCollection: (id) =>
    call(async () => {
      await api.delete(`/pyq/collections/${id}`);
    }),

  setCollectionMembership: (collectionId, questionId, member) =>
    call(async () => {
      if (member) await api.put(`/pyq/collections/${collectionId}/questions/${questionId}`);
      else await api.delete(`/pyq/collections/${collectionId}/questions/${questionId}`);
    }),

  getStreak: () => call(() => api.get<StreakSummary>("/pyq/streak")),

  getRevision: () =>
    call(async () => {
      const wire = await api.get<{ items: WireRevisionItem[] }>("/pyq/revision");
      return wire.items.map(
        (item): RevisionItem => ({
          question: toPublicQuestion(item.question),
          latestCorrect: item.latestCorrect,
          lastAttemptedAt: item.lastAttemptedAt ?? undefined,
          lastCorrectAt: item.lastCorrectAt ?? undefined,
          lastWrongAt: item.lastWrongAt ?? undefined,
          attemptCount: item.attemptCount,
          incorrectCount: item.incorrectCount,
          neverCorrected: item.neverCorrected,
          flagged: item.flagged,
          bookmarkedAt: item.bookmarkedAt ?? undefined,
          collectedAt: item.collectedAt ?? undefined,
          due: item.due,
        })
      );
    }),

  getReinforce: (recentDays) =>
    call(async () => {
      const wire = await api.get<{ all: WireQuestion[]; recentIds: string[]; notRevisitedIds: string[] }>(
        `/pyq/reinforce${queryString({ recentDays })}`
      );
      const all = wire.all.map(toPublicQuestion);
      const recent = new Set(wire.recentIds);
      return {
        all,
        recent: all.filter((q) => recent.has(q.id)),
        notRevisited: all.filter((q) => !recent.has(q.id)),
      };
    }),

  getPreferences: () =>
    call(async () => {
      const wire = await api.get<{ targetExamId: string | null; dailyTarget: number }>("/pyq/preferences");
      return wire as PyqPreferences;
    }),

  updatePreferences: (patch) =>
    call(async () => {
      const wire = await api.put<{ targetExamId: string | null; dailyTarget: number }>("/pyq/preferences", patch);
      return wire as PyqPreferences;
    }),
};
