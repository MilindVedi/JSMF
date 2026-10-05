import type {
  Collection,
  Exam,
  ExamId,
  OverallStatistics,
  PublicQuestion,
  ReportReason,
  SessionMode,
  SessionQuestion,
  Subject,
  TestSession,
} from "@/types";

/**
 * The port every PYQ screen talks to. Two adapters implement it — `mock`
 * (static content + browser persistence) and `api` (the NestJS backend) — and
 * `./index.ts` picks one from NEXT_PUBLIC_DATA_SOURCE. Screens reach it only
 * through the hooks in `@/hooks/pyq`; nothing above this layer may import
 * mock data or the API client for PYQ data.
 *
 * Shapes here are the UI's, not the wire's: adapters translate.
 */

export interface TaxonomyTopic {
  id: string;
  subjectId: string;
  name: string;
}

export interface Taxonomy {
  exams: Exam[];
  /** `questionCount` = questions available in the bank for that subject. */
  subjects: (Subject & { questionCount: number })[];
  topics: TaxonomyTopic[];
}

export type QuestionUserStatus = "unattempted" | "correct" | "incorrect";
export type QuestionStatusFilter = QuestionUserStatus | "bookmarked";

export interface QuestionQuery {
  examIds?: ExamId[];
  years?: number[];
  subjectIds?: string[];
  topicIds?: string[];
  status?: QuestionStatusFilter;
  /** Mock-only refinements; ignored where `capabilities` says unsupported. */
  collectionIds?: string[];
  search?: string;
  sort?: string;
}

export interface QuestionListItem extends PublicQuestion {
  bookmarked: boolean;
  userStatus: QuestionUserStatus;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type SessionOrder = "random" | "unattempted-first" | "incorrect-first" | "bookmarked-first";

export interface CreateSessionInput {
  mode: SessionMode;
  label: string;
  /** Explicit questions in order. When absent, `filters` + `count` draw a random set. */
  questionIds?: string[];
  filters?: QuestionQuery;
  count?: number;
  order?: SessionOrder;
  timed?: boolean;
  durationSec?: number;
  sourceHref?: string;
}

export interface SessionDetail {
  session: TestSession;
  /** In session order; answers present once revealed. */
  questions: SessionQuestion[];
  submitted: boolean;
}

export interface SessionListItem {
  session: TestSession;
  submitted: boolean;
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  accuracy: number;
  totalTimeSec: number;
  /** What the session covers; empty means "not narrowed" (all). */
  examIds: string[];
  subjectIds: string[];
  /** Where "Resume" should land. */
  resumeIndex: number;
  /** Optional sort keys an adapter may know (mock does, the API does not). */
  newestYear?: number;
  oldestYear?: number;
  lastWrongAt?: string;
}

export interface AnswerResult {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  correctOptionId: string;
  explanation: string;
  explanationFigure?: SessionQuestion["explanationFigure"];
}

export interface BookmarkItem {
  questionId: string;
  createdAt: string;
  question: PublicQuestion;
  userStatus?: QuestionUserStatus;
}

export interface WrongQuestionItem extends PublicQuestion {
  lastAnsweredAt?: string;
}

export interface PyqAccess {
  subscribed: boolean;
  /** Null when unlimited. */
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
  /** The plan behind `subscribed` (api mode); null/absent for free users. */
  plan?: { productId: string; title: string; expiresAt: string | null } | null;
}

/** A subscription plan on sale. `id` is what checkout takes. */
export interface PyqPlan {
  id: string;
  name: string;
  tagline: string | null;
  /** Rupees, for display; the server prices the order itself. */
  price: number;
  currency: string;
  durationDays: number;
  /** "month" | "quarter" | "year" when the plan says so. */
  period: string | null;
  popular: boolean;
  features: string[];
}

/** What starting a plan checkout returns. */
export type PlanCheckout =
  | { kind: "FREE" }
  | {
      kind: "PAYMENT_REQUIRED";
      orderId: string;
      amountMinor: string;
      currency: string;
      providerOrderId: string;
      /** Publishable Razorpay key ("stub_key_id" under the stub driver). */
      checkoutKeyId: string;
    };

export interface PaymentConfirmation {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/** Streak by India-time day; a day counts once it has at least one answer. */
export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
  /** `YYYY-MM-DD` the adapter considers today. */
  today: string;
  todayCount: number;
  dailyTarget: number;
  todayDone: boolean;
  lastActiveDay: string | null;
}

/** One question worth another look, with the facts revision filters/sorts by. */
export interface RevisionItem {
  question: PublicQuestion;
  /** Latest answer's correctness; null when never answered (bookmarked/collected only). */
  latestCorrect: boolean | null;
  lastAttemptedAt?: string;
  lastCorrectAt?: string;
  lastWrongAt?: string;
  attemptCount: number;
  incorrectCount: number;
  /** Answered at least once and never correctly. */
  neverCorrected: boolean;
  flagged: boolean;
  bookmarkedAt?: string;
  /** Newest time it was put in one of the user's collections. */
  collectedAt?: string;
  /** Wrong, flagged, or correct but not seen for a while. */
  due: boolean;
}

export interface ReinforceData {
  all: PublicQuestion[];
  recent: PublicQuestion[];
  notRevisited: PublicQuestion[];
}

export interface PyqPreferences {
  targetExamId: ExamId | null;
  dailyTarget: number;
}

export interface CollectionInput {
  name: string;
  description?: string | null;
  questionIds?: string[];
}

export interface DataSourceCapabilities {
  /** Free-text search over stems. */
  search: boolean;
  /** Client-side sort options of the question bank. */
  sort: boolean;
  /** User collections. */
  collections: boolean;
  /** Smart ordering of custom tests (unattempted-first, ...). */
  sessionOrdering: boolean;
}

export interface PyqDataSource {
  readonly kind: "mock" | "api";
  readonly capabilities: DataSourceCapabilities;

  getTaxonomy(): Promise<Taxonomy>;
  getAccess(): Promise<PyqAccess>;

  listPlans(): Promise<PyqPlan[]>;
  /** Creates the order for a plan (priced server-side). */
  startPlanCheckout(planId: string): Promise<PlanCheckout>;
  /** The browser callback after the Razorpay widget succeeds. The webhook is the authority. */
  confirmPayment(payment: PaymentConfirmation): Promise<void>;
  /** Stub payment driver only (dev): drives the order through the real verify path. */
  simulatePayment(orderId: string): Promise<boolean>;
  listQuestions(query: QuestionQuery, page: number, pageSize: number): Promise<Page<QuestionListItem>>;
  reportQuestion(questionId: string, reason: ReportReason, details?: string): Promise<void>;

  createSession(input: CreateSessionInput): Promise<string>;
  listSessions(page: number, pageSize: number): Promise<Page<SessionListItem>>;
  getSession(sessionId: string): Promise<SessionDetail>;
  answer(sessionId: string, questionId: string, optionId: string, timeSpentMs: number): Promise<AnswerResult>;
  setFlag(sessionId: string, questionId: string, flagged: boolean): Promise<void>;
  submitSession(sessionId: string): Promise<SessionDetail>;
  getReview(sessionId: string): Promise<SessionDetail>;

  listBookmarks(): Promise<BookmarkItem[]>;
  setBookmark(questionId: string, bookmarked: boolean): Promise<void>;
  listWrongQuestions(): Promise<WrongQuestionItem[]>;
  getStats(): Promise<OverallStatistics>;

  listCollections(): Promise<Collection[]>;
  createCollection(input: CollectionInput): Promise<Collection>;
  updateCollection(id: string, patch: { name?: string; description?: string | null }): Promise<Collection>;
  deleteCollection(id: string): Promise<void>;
  setCollectionMembership(collectionId: string, questionId: string, member: boolean): Promise<void>;

  getStreak(): Promise<StreakSummary>;
  getRevision(): Promise<RevisionItem[]>;
  getReinforce(recentDays: number): Promise<ReinforceData>;
  getPreferences(): Promise<PyqPreferences>;
  updatePreferences(patch: Partial<PyqPreferences>): Promise<PyqPreferences>;
}

/** Thrown by any adapter when the free daily allowance is used up. */
export class DailyLimitError extends Error {
  constructor(
    message: string,
    readonly dailyLimit: number | null,
  ) {
    super(message);
    this.name = "DailyLimitError";
  }
}

/** Thrown when a session or question does not exist (or isn't the user's). */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
