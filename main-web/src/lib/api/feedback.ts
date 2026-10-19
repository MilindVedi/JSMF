import { api } from "./client";

/**
 * Feedback forms (backend: /feedback/forms/:id). Public: the personal link in
 * the email carries a token (`k`) that stands in for signing in; without one,
 * the signed-in account is used, and the bearer header is sent when there is
 * one. The server decides who the visitor is and what they may do.
 */

export type FeedbackQuestionKind = "RATING" | "SCALE" | "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTI_CHOICE";

export interface FeedbackQuestion {
  id: string;
  kind: FeedbackQuestionKind;
  label: string;
  helpText: string | null;
  required: boolean;
  options: string[];
}

export interface FeedbackAnswer {
  questionId: string;
  rating?: number | null;
  text?: string | null;
  choices?: string[] | null;
}

export type FeedbackViewState = "OPEN" | "PREVIEW" | "SIGN_IN_REQUIRED" | "NOT_ELIGIBLE" | "CLOSED";

/**
 * PERSONAL: replying as themselves (the email's link, or signed in).
 * OPEN_LINK: the no-sign-in link, with a typed name. Null when there is nothing to fill in.
 */
export type FeedbackReplyMode = "PERSONAL" | "OPEN_LINK";

export interface FeedbackView {
  state: FeedbackViewState;
  form: {
    id: string;
    title: string;
    intro: string | null;
    thankYouText: string | null;
    sessionTitle: string;
    /** "Day 1", or null for a one-day session. */
    dayLabel: string | null;
    allowAnonymous: boolean;
    askConsentToPublish: boolean;
    /** Ask whether their first name may appear with the reply on the website. */
    askShowName: boolean;
    /** The shared link takes replies without signing in, with a typed name. */
    openLink: boolean;
    closesAt: string | null;
    questions: FeedbackQuestion[];
  };
  mode: FeedbackReplyMode | null;
  respondent: { firstName: string } | null;
  response: {
    /** The name typed on the open link; absent for a personal reply. */
    respondentName?: string | null;
    isAnonymous: boolean;
    consentToPublish: boolean;
    showName: boolean | null;
    submittedAt: string;
    editedAt: string | null;
    answers: FeedbackAnswer[];
  } | null;
}

export const feedbackApi = {
  /** `editKey`: this browser's key for the open link, so its earlier reply comes back. */
  view: (formId: string, token?: string | null, editKey?: string | null) =>
    api.get<FeedbackView>(
      `/feedback/forms/${formId}${token ? `?k=${encodeURIComponent(token)}` : ""}`,
      undefined,
      editKey ? { "x-feedback-edit-key": editKey } : undefined,
    ),

  submitOpen: (
    formId: string,
    body: {
      respondentName: string;
      editKey: string;
      answers: FeedbackAnswer[];
      consentToPublish?: boolean;
      showName?: boolean;
    },
  ) => api.post<{ submittedAt: string; edited: boolean }>(`/feedback/forms/${formId}/open-response`, body),

  submit: (
    formId: string,
    body: {
      token?: string;
      answers: FeedbackAnswer[];
      isAnonymous?: boolean;
      consentToPublish?: boolean;
      showName?: boolean;
    },
  ) => api.post<{ submittedAt: string; edited: boolean }>(`/feedback/forms/${formId}/response`, body),
};
