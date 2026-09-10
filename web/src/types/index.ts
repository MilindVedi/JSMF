/**
 * Core data model for the JSMF mock UI prototype.
 *
 * These types describe the SHAPE of data the UI is built against for the
 * frontend-only mock stage — they are intentionally not a database schema.
 * See docs/05-ui-ux-plan.md for the reasoning behind these decisions and
 * docs/03-architecture.md for how this is expected to evolve into a real
 * backend-driven model later.
 */

// ---------------------------------------------------------------------------
// Exams, subjects, topics
// ---------------------------------------------------------------------------

export type ExamId = "neet-pg" | "fmge" | "inicet";

export interface Exam {
  id: ExamId;
  name: string;
  shortName: string;
  description: string;
}

export type SubjectGroup = "pre-clinical" | "para-clinical" | "clinical";

export interface Subject {
  id: string;
  name: string;
  slug: string;
  group: SubjectGroup;
  /** Short description shown in empty states / subject headers. */
  description?: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface QuestionOption {
  id: string;
  text: string;
  imageUrl?: string;
}

export type Difficulty = "easy" | "medium" | "hard";

/** A stand-in for a real image asset — see FigurePlaceholder component. */
export type FigureKind = "xray" | "ct" | "histology" | "ecg" | "clinical-photo" | "diagram" | "chart";

export interface QuestionFigure {
  kind: FigureKind;
  caption: string;
}

export interface Question {
  id: string;
  examId: ExamId;
  year: number;
  subjectId: string;
  topicId: string;
  stem: string;
  stemFigure?: QuestionFigure;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  explanationFigure?: QuestionFigure;
  difficulty: Difficulty;
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export interface BookmarkEntry {
  id: string;
  questionId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Practice sessions / attempts
// ---------------------------------------------------------------------------

export type SessionMode = "browse" | "custom-test" | "bookmarks" | "wrong-questions";

export interface SessionFilters {
  examIds?: ExamId[];
  years?: number[];
  subjectIds?: string[];
  topicIds?: string[];
}

export interface SessionConfig {
  timed: boolean;
  durationSec?: number;
}

export interface Attempt {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  timeSpentSec: number;
  answeredAt: string;
}

export interface TestSession {
  id: string;
  mode: SessionMode;
  label: string;
  filters?: SessionFilters;
  questionIds: string[];
  config: SessionConfig;
  /** questionId -> flagged-for-review, independent of whether it's answered */
  flags: Record<string, boolean>;
  /** questionId -> Attempt, absent means unattempted */
  attempts: Record<string, Attempt>;
  startedAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// User / subscription
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  targetExamId: ExamId;
  joinedAt: string;
  currentPlanId: string;
  streakDays: number;
  lastActiveAt: string;
}

export interface SubscriptionPlanEntitlements {
  examIds: ExamId[];
  features: string[];
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly?: number;
  entitlements: SubscriptionPlanEntitlements;
  highlight?: boolean;
  tagline: string;
}

// ---------------------------------------------------------------------------
// Question reporting
// ---------------------------------------------------------------------------

export type ReportReason =
  | "wrong-answer"
  | "wrong-explanation"
  | "incorrect-question"
  | "image-issue"
  | "other";

export interface QuestionReport {
  questionId: string;
  reason: ReportReason;
  details?: string;
}

// ---------------------------------------------------------------------------
// Derived / computed shapes (not stored — produced by selectors)
// ---------------------------------------------------------------------------

export interface SubjectPerformance {
  subjectId: string;
  attempted: number;
  correct: number;
  incorrect: number;
  accuracy: number; // 0-100
}

export interface OverallStatistics {
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  accuracy: number; // 0-100
  /** Share of the whole question bank attempted at least once, 0-100. Distinct
   *  from accuracy: a student can score well on repeated tests while leaving
   *  most of the bank untouched. */
  coverage: number;
  bySubject: SubjectPerformance[];
  /** `accuracy` is that session's own score; `cumulativeAccuracy` is the
   *  running accuracy across every attempt up to that point in time. */
  accuracyTrend: { date: string; accuracy: number; cumulativeAccuracy: number }[];
  wrongQuestionCount: number;
  bookmarkCount: number;
}

export interface SessionSummary {
  session: TestSession;
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  accuracy: number;
  totalTimeSec: number;
}
