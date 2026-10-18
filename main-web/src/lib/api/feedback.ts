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
    closesAt: string | null;
    questions: FeedbackQuestion[];
  };
  respondent: { firstName: string } | null;
  response: {
    isAnonymous: boolean;
    consentToPublish: boolean;
    showName: boolean | null;
    submittedAt: string;
    editedAt: string | null;
    answers: FeedbackAnswer[];
  } | null;
}

export const feedbackApi = {
  view: (formId: string, token?: string | null) =>
    api.get<FeedbackView>(`/feedback/forms/${formId}${token ? `?k=${encodeURIComponent(token)}` : ""}`),

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
