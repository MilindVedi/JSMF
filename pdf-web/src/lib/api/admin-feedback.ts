import { api } from "./client";

/**
 * A session's feedback forms (backend: /admin/sessions/:id/feedback-forms):
 * build them, send the personal links, read the replies, and pick replies to
 * show on the website.
 */

export type FeedbackFormStatus = "DRAFT" | "OPEN" | "CLOSED";
export type FeedbackEmailMode = "AUTO_AFTER_DAY" | "MANUAL";
export type FeedbackQuestionKind = "RATING" | "SCALE" | "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTI_CHOICE";

export const QUESTION_KINDS: Array<{ kind: FeedbackQuestionKind; label: string }> = [
  { kind: "RATING", label: "Star rating (1–5)" },
  { kind: "SCALE", label: "Scale (0–10)" },
  { kind: "SHORT_TEXT", label: "Short answer" },
  { kind: "LONG_TEXT", label: "Paragraph" },
  { kind: "SINGLE_CHOICE", label: "Multiple choice (one)" },
  { kind: "MULTI_CHOICE", label: "Checkboxes (any)" },
];

export interface FeedbackFormListItem {
  id: string;
  title: string;
  dayId: string | null;
  dayNumber: number | null;
  status: FeedbackFormStatus;
  emailMode: FeedbackEmailMode;
  responses: number;
  /** Average of the form's first star question, or null. */
  averageRating: number | null;
  emailDueAt: string | null;
  createdAt: string;
}

export interface FeedbackQuestion {
  id?: string;
  kind: FeedbackQuestionKind;
  label: string;
  helpText: string | null;
  required: boolean;
  options: string[];
  /** Someone has answered it: its type is fixed, and removing it archives it. */
  answered?: boolean;
}

export interface FeedbackFormDetail {
  id: string;
  liveSessionId: string;
  title: string;
  intro: string | null;
  thankYouText: string | null;
  dayId: string | null;
  dayNumber: number | null;
  status: FeedbackFormStatus;
  emailMode: FeedbackEmailMode;
  emailDelayMinutes: number;
  allowAnonymous: boolean;
  /** Off: the team picks any reply for the website. On: only ones that said yes. */
  askConsentToPublish: boolean;
  askShowName: boolean;
  closesAt: string | null;
  /** When the day (or the session) it asks about ends. */
  endsAt: string | null;
  emailDueAt: string | null;
  /** For the Telegram group. Asks people to sign in. */
  shareUrl: string;
  responses: number;
  questions: Array<FeedbackQuestion & { id: string; answered: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFormSettings {
  title?: string;
  intro?: string | null;
  thankYouText?: string | null;
  dayId?: string | null;
  status?: FeedbackFormStatus;
  emailMode?: FeedbackEmailMode;
  emailDelayMinutes?: number;
  allowAnonymous?: boolean;
  askConsentToPublish?: boolean;
  askShowName?: boolean;
  closesAt?: string | null;
}

export interface FeedbackPersonRow {
  userId: string;
  name: string;
  email: string | null;
  joinedAt: string;
  emailedAt: string | null;
  emailCount: number;
  lastError: string | null;
  openedAt: string | null;
  respondedAt: string | null;
  responded: boolean;
}

export interface FeedbackPeople {
  rows: FeedbackPersonRow[];
  total: number;
  emailed: number;
  opened: number;
  responded: number;
  otherResponses: number;
}

export interface FeedbackSendResult {
  attempted: number;
  sent: number;
  skipped: number;
  failed: Array<{ userId: string; name: string; email: string | null; reason: string }>;
}

export type QuestionSummary =
  | {
      questionId: string;
      kind: "RATING" | "SCALE";
      answered: number;
      average: number | null;
      distribution: Array<{ value: number; count: number }>;
    }
  | {
      questionId: string;
      kind: "SINGLE_CHOICE" | "MULTI_CHOICE";
      answered: number;
      choices: Array<{ label: string; count: number; current: boolean }>;
    }
  | { questionId: string; kind: "SHORT_TEXT" | "LONG_TEXT"; answered: number };

export interface FeedbackHighlight {
  id: string;
  sectionId: string;
  quote: string;
  attribution: string;
  rating: number | null;
}

export interface FeedbackReply {
  id: string;
  isAnonymous: boolean;
  /** Null when anonymous. */
  name: string | null;
  email: string | null;
  stage: string | null;
  consentToPublish: boolean;
  /** "Show my first name on the website": null when the form did not ask. */
  showName: boolean | null;
  source: "EMAIL_LINK" | "SIGNED_IN";
  submittedAt: string;
  editedAt: string | null;
  answers: Array<{ questionId: string; rating: number | null; text: string | null; choices: string[] }>;
  highlights: FeedbackHighlight[];
}

export interface FeedbackResults {
  formId: string;
  total: number;
  questions: Array<{ id: string; kind: FeedbackQuestionKind; label: string; options: string[]; archived: boolean }>;
  summary: QuestionSummary[];
  responses: FeedbackReply[];
}

export interface FeedbackTemplate {
  key: string;
  name: string;
  description: string;
  questions: number;
}

export interface ImportableForm {
  id: string;
  title: string;
  sessionId: string;
  sessionTitle: string;
  questions: number;
  createdAt: string;
}

const base = (sessionId: string) => `/admin/sessions/${sessionId}/feedback-forms`;

export const feedbackAdminApi = {
  list: (sessionId: string) => api.get<FeedbackFormListItem[]>(base(sessionId)),
  templates: () => api.get<FeedbackTemplate[]>("/admin/feedback/templates"),
  /** Every form on every session, to import questions from. */
  importable: () => api.get<ImportableForm[]>("/admin/feedback/forms"),
  create: (
    sessionId: string,
    input: { title?: string; dayId?: string | null; copyFromFormId?: string | null; templateKey?: string | null },
  ) =>
    api.post<FeedbackFormDetail>(base(sessionId), input),
  get: (sessionId: string, formId: string) => api.get<FeedbackFormDetail>(`${base(sessionId)}/${formId}`),
  update: (sessionId: string, formId: string, input: FeedbackFormSettings) =>
    api.patch<FeedbackFormDetail>(`${base(sessionId)}/${formId}`, input),
  replaceQuestions: (sessionId: string, formId: string, questions: FeedbackQuestion[]) =>
    api.put<FeedbackFormDetail>(`${base(sessionId)}/${formId}/questions`, {
      questions: questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        label: q.label,
        helpText: q.helpText,
        required: q.required,
        options: q.options,
      })),
    }),
  remove: (sessionId: string, formId: string) => api.delete<void>(`${base(sessionId)}/${formId}`),

  people: (sessionId: string, formId: string) => api.get<FeedbackPeople>(`${base(sessionId)}/${formId}/people`),
  /** No userIds: everyone not yet emailed (or, with includeAlreadyEmailed, everyone who has not replied). */
  send: (sessionId: string, formId: string, input: { userIds?: string[]; includeAlreadyEmailed?: boolean }) =>
    api.post<FeedbackSendResult>(`${base(sessionId)}/${formId}/send`, input),

  results: (sessionId: string, formId: string) => api.get<FeedbackResults>(`${base(sessionId)}/${formId}/results`),
  removeResponse: (sessionId: string, formId: string, responseId: string) =>
    api.delete<void>(`${base(sessionId)}/${formId}/responses/${responseId}`),

  addHighlight: (
    sessionId: string,
    formId: string,
    input: {
      responseId: string;
      sectionId: string;
      quote?: string;
      attribution?: string;
      rating?: number | null;
      /** Your call; defaults to the student's answer. Ignored for anonymous replies. */
      showName?: boolean;
    },
  ) => api.post<FeedbackHighlight>(`${base(sessionId)}/${formId}/highlights`, input),
  removeHighlight: (sessionId: string, formId: string, highlightId: string) =>
    api.delete<void>(`${base(sessionId)}/${formId}/highlights/${highlightId}`),
};
