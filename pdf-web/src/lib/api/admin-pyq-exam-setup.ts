import { api } from "./client";

/**
 * PYQ → Exam setup: the option-shuffle switch and each exam's paper pattern
 * that full mocks follow. ADMIN-gated server-side; every save is audited.
 */

/** An exact mark: 1/3 is { num: 1, den: 3 }. */
export interface Fraction {
  num: number;
  den: number;
}

export interface PatternSection {
  name: string;
  questions: number;
  minutes: number;
}

export interface ExamPattern {
  version?: number;
  sections: PatternSection[];
  /** Each section opens when the previous closes, and closes for good with its own time. */
  sectionsLocked: boolean;
  marking: {
    correct: Fraction;
    /** Marks taken off for a wrong answer; 0 = no negative marking. */
    incorrect: Fraction;
  };
}

export interface AdminExamSetup {
  examId: string;
  name: string;
  shortName: string;
  /** Published questions of this exam — what a mock draws from. */
  publishedQuestions: number;
  enabled: boolean;
  pattern: ExamPattern | null;
  updatedAt: string | null;
}

export interface ExamSetupOverview {
  settings: { shuffleOptions: boolean };
  exams: AdminExamSetup[];
}

export const adminExamSetupApi = {
  overview: () => api.get<ExamSetupOverview>("/admin/pyq/exam-setup"),

  updateSettings: (input: { shuffleOptions: boolean }) =>
    api.patch<{ shuffleOptions: boolean }>("/admin/pyq/exam-setup/settings", input),

  savePattern: (examId: string, input: { enabled: boolean; pattern: ExamPattern }) =>
    api.put<AdminExamSetup>(`/admin/pyq/exam-setup/patterns/${encodeURIComponent(examId)}`, input),
};
