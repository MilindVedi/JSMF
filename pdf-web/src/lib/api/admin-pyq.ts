import { api } from "./client";
import type { Paginated } from "./types";

/** PYQ question-bank admin endpoints. Every one is ADMIN-gated server-side. */

export type PyqQuestionStatus = "DRAFT" | "PUBLISHED";
export type PyqDifficulty = "easy" | "medium" | "hard";
export type PyqReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";
export type PyqReportReason =
  | "WRONG_ANSWER"
  | "WRONG_EXPLANATION"
  | "INCORRECT_QUESTION"
  | "IMAGE_ISSUE"
  | "OTHER";

export interface PyqOption {
  id: string;
  label: string;
  text: string;
  imageUrl: string | null;
}

/** Where on a question an image goes: under the question, or with its explanation. */
export type PyqImageField = "stem" | "explanation";

/** An image uploaded for a question. Kept private: `url` is a short-lived link, for showing only. */
export interface PyqImageUpload {
  url: string;
}

export interface PyqAdminQuestion {
  id: string;
  externalKey: string;
  /** Taxonomy ids are slugs. */
  examId: string;
  subjectId: string;
  topicId: string | null;
  year: number;
  /** The exam session's month, 1–12 (6 = June); null when not recorded. */
  sessionMonth: number | null;
  stem: string;
  /** A pasted link to an image hosted elsewhere. An uploaded image (below) wins over it. */
  stemImageUrl: string | null;
  /** The uploaded question image: private, so `url` is a short-lived preview link. */
  stemImageUpload: PyqImageUpload | null;
  options: PyqOption[];
  correctOptionId: string | null;
  explanation: string;
  /** As `stemImageUrl` / `stemImageUpload`, for the image shown with the explanation. */
  explanationImageUrl: string | null;
  explanationImageUpload: PyqImageUpload | null;
  /** High-yield pearls / buzzwords, one per item. */
  pearls: string[];
  quickRevision: string | null;
  /** Why an option is right or wrong, by option id. */
  optionExplanations: Record<string, string>;
  difficulty: PyqDifficulty;
  status: PyqQuestionStatus;
  /** Admin's "keep option order": never shuffled for students. */
  keepOptionOrder: boolean;
  /**
   * Why students always see these options in the order written — the admin
   * tick, or a reference the server found ("All of the above", "option B").
   * Null when they may be shuffled.
   */
  optionOrderLock:
    | { reason: "admin" }
    | { reason: "options-refer-to-options" | "explanation-names-options"; match: string }
    | null;
  createdAt: string;
  updatedAt: string;
  reports: { open: number; total: number };
}

export const PYQ_SESSION_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "June 2026", or the year alone when no session month is recorded. */
export function pyqPaperLabel(year: number, sessionMonth: number | null | undefined): string {
  const month = sessionMonth ? PYQ_SESSION_MONTHS[sessionMonth - 1] : undefined;
  return month ? `${month} ${year}` : String(year);
}

export interface PyqOptionInput {
  id?: string;
  text: string;
  imageUrl?: string | null;
  isCorrect: boolean;
  /** Why this option is right or wrong; null: none. */
  explanation?: string | null;
}

export interface PyqQuestionInput {
  externalKey?: string;
  examId: string;
  subjectId: string;
  topicId?: string | null;
  year: number;
  /** 1–12; null: none. */
  sessionMonth?: number | null;
  stem: string;
  stemImageUrl?: string | null;
  explanation: string;
  explanationImageUrl?: string | null;
  pearls?: string[];
  quickRevision?: string | null;
  difficulty: PyqDifficulty;
  status?: PyqQuestionStatus;
  keepOptionOrder?: boolean;
  options: PyqOptionInput[];
}

export interface PyqExam {
  id: string;
  name: string;
  shortName: string;
  description: string | null;
  sortOrder: number;
  questionCount: number;
}

export interface PyqSubject {
  id: string;
  name: string;
  group: string;
  description: string | null;
  sortOrder: number;
  questionCount: number;
}

export interface PyqTopic {
  id: string;
  subjectId: string;
  name: string;
  sortOrder: number;
  questionCount: number;
}

export interface PyqTaxonomy {
  exams: PyqExam[];
  subjects: PyqSubject[];
  topics: PyqTopic[];
}

export interface PyqReport {
  id: string;
  reason: PyqReportReason;
  details: string | null;
  status: PyqReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** What the admin wrote when closing it. Null while open, and for reports
   *  closed before the note was persisted. */
  adminNote: string | null;
  resolvedBy: { id: string; name: string | null; email: string } | null;
  reporter: { id: string; email: string; name: string | null };
  question: {
    id: string;
    stem: string;
    status: PyqQuestionStatus;
    deleted: boolean;
    subjectId: string;
  };
}

/** What a release push would do with one question (see backend question-release.ts). */
export type PyqReleaseVerdict = "NEW" | "CHANGED" | "UNCHANGED" | "CONFLICT" | "DELETED";

export interface PyqReleasePreview {
  questions: { externalKey: string; verdict: PyqReleaseVerdict; reason?: string; published: boolean }[];
  /** Exams, subjects and topics the push will create here — it never changes existing ones. */
  create: { exams: string[]; subjects: string[]; topics: string[] };
  /** Images (SHA-256) not uploaded yet. */
  missingImages: string[];
  problems: string[];
}

export type PyqReleaseOutcome = "CREATED" | "UPDATED" | "OVERWRITTEN" | "UNCHANGED" | "SKIPPED" | "FAILED";

export interface PyqReleaseApplyResult {
  questions: { externalKey: string; outcome: PyqReleaseOutcome; reason?: string }[];
}

export interface PyqImportResult {
  exams: number;
  subjects: number;
  topics: number;
  created: number;
  updated: number;
}

/** One bulk publish/unpublish at most (the server's MAX_BULK_QUESTIONS). */
export const PYQ_MAX_BULK = 2000;

export interface PyqQuestionFilters {
  examId?: string;
  subjectId?: string;
  topicId?: string;
  status?: PyqQuestionStatus;
  q?: string;
  reported?: boolean;
  page?: number;
  pageSize?: number;
}

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== false) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export type TaxonomyKind = "exams" | "subjects" | "topics";

export const adminPyqApi = {
  listQuestions: (filters: PyqQuestionFilters = {}) =>
    api.get<Paginated<PyqAdminQuestion>>(`/admin/pyq/questions${queryString({ ...filters })}`),

  getQuestion: (id: string) => api.get<PyqAdminQuestion>(`/admin/pyq/questions/${id}`),

  createQuestion: (input: PyqQuestionInput) =>
    api.post<PyqAdminQuestion>("/admin/pyq/questions", input),

  updateQuestion: (id: string, input: Partial<PyqQuestionInput>) =>
    api.patch<PyqAdminQuestion>(`/admin/pyq/questions/${id}`, input),

  setStatus: (id: string, status: PyqQuestionStatus) =>
    api.patch<PyqAdminQuestion>(`/admin/pyq/questions/${id}/status`, { status }),

  /** Ids of every question matching the filters (at most PYQ_MAX_BULK), for "Select all N matching". */
  questionIds: (filters: Omit<PyqQuestionFilters, "page" | "pageSize"> = {}) =>
    api.get<{ total: number; ids: string[]; truncated: boolean }>(
      `/admin/pyq/questions/ids${queryString({ ...filters })}`,
    ),

  /** Publish or unpublish exactly these questions; `changed` leaves out deleted ones and ones already so. */
  setStatusMany: (ids: string[], status: PyqQuestionStatus) =>
    api.patch<{ requested: number; changed: number }>("/admin/pyq/questions/status", { ids, status }),

  deleteQuestion: (id: string) => api.delete<void>(`/admin/pyq/questions/${id}`),

  /** Removes a question's uploaded image and deletes its file; returns the question. */
  removeQuestionImage: (id: string, field: PyqImageField) =>
    api.delete<PyqAdminQuestion>(`/admin/pyq/questions/${id}/images/${field}`),

  importQuestions: (payload: unknown) =>
    api.post<PyqImportResult>("/admin/pyq/questions/import", payload),

  /** What pushing these release questions would do. Writes nothing. */
  previewRelease: (body: unknown) => api.post<PyqReleasePreview>("/admin/pyq/releases/preview", body),

  /** Pushes release questions (one chunk). Safe to repeat. */
  applyRelease: (body: unknown) => api.post<PyqReleaseApplyResult>("/admin/pyq/releases/apply", body),

  taxonomy: () => api.get<PyqTaxonomy>("/admin/pyq/taxonomy"),

  createExam: (input: { slug: string; name: string; shortName?: string }) =>
    api.post<unknown>("/admin/pyq/exams", input),

  createSubject: (input: { slug: string; name: string; group: string }) =>
    api.post<unknown>("/admin/pyq/subjects", input),

  createTopic: (input: { slug: string; subjectId: string; name: string }) =>
    api.post<unknown>("/admin/pyq/topics", input),

  rename: (kind: TaxonomyKind, slug: string, name: string) =>
    api.patch<unknown>(`/admin/pyq/${kind}/${slug}`, { name }),

  remove: (kind: TaxonomyKind, slug: string) => api.delete<void>(`/admin/pyq/${kind}/${slug}`),

  reorder: (kind: TaxonomyKind, slugs: string[]) =>
    api.put<PyqTaxonomy>(`/admin/pyq/${kind}/order`, { slugs }),

  listReports: (params: { status?: PyqReportStatus; questionId?: string; page?: number } = {}) =>
    api.get<Paginated<PyqReport>>(`/admin/pyq/reports${queryString(params)}`),

  resolveReport: (id: string, status: "RESOLVED" | "DISMISSED", note?: string) =>
    api.patch<unknown>(`/admin/pyq/reports/${id}`, { status, note: note || undefined }),
};
