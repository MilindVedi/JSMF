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

export interface PyqAdminQuestion {
  id: string;
  externalKey: string;
  /** Taxonomy ids are slugs. */
  examId: string;
  subjectId: string;
  topicId: string | null;
  year: number;
  stem: string;
  stemImageUrl: string | null;
  options: PyqOption[];
  correctOptionId: string | null;
  explanation: string;
  explanationImageUrl: string | null;
  difficulty: PyqDifficulty;
  status: PyqQuestionStatus;
  createdAt: string;
  updatedAt: string;
  reports: { open: number; total: number };
}

export interface PyqOptionInput {
  id?: string;
  text: string;
  imageUrl?: string | null;
  isCorrect: boolean;
}

export interface PyqQuestionInput {
  externalKey?: string;
  examId: string;
  subjectId: string;
  topicId?: string | null;
  year: number;
  stem: string;
  stemImageUrl?: string | null;
  explanation: string;
  explanationImageUrl?: string | null;
  difficulty: PyqDifficulty;
  status?: PyqQuestionStatus;
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

export interface PyqImportResult {
  exams: number;
  subjects: number;
  topics: number;
  created: number;
  updated: number;
}

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

  deleteQuestion: (id: string) => api.delete<void>(`/admin/pyq/questions/${id}`),

  importQuestions: (payload: unknown) =>
    api.post<PyqImportResult>("/admin/pyq/questions/import", payload),

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
