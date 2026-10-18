import { FeedbackFormStatus, FeedbackQuestionKind } from '@prisma/client';

/**
 * The rules of a feedback form, as plain functions: when its day ends, who may
 * answer it, when its email is due, and whether a set of answers is valid.
 * No database here, so each rule is tested on its own (feedback-rules.spec.ts).
 */

export interface DayTimes {
  id: string;
  startsAt: Date;
  durationMinutes: number;
}

/** Longest answer to a short-answer question, in characters. */
export const SHORT_TEXT_MAX = 300;
/** Longest answer to a paragraph question, in characters. */
export const LONG_TEXT_MAX = 5000;
/** Most choices a choice question may have. */
export const MAX_OPTIONS = 20;
/** Most questions on one form. */
export const MAX_QUESTIONS = 30;

/** The range each numeric kind accepts. */
export const RATING_RANGE: Partial<Record<FeedbackQuestionKind, { min: number; max: number }>> = {
  [FeedbackQuestionKind.RATING]: { min: 1, max: 5 },
  [FeedbackQuestionKind.SCALE]: { min: 0, max: 10 },
};

/**
 * When the thing the form asks about is over: its day's end, or for a
 * whole-session form (no day) the end of the last day. Null when the session
 * has no days yet, so there is nothing to have ended.
 */
export function formEndsAt(dayId: string | null, days: DayTimes[]): Date | null {
  const ends = (dayId ? days.filter((d) => d.id === dayId) : days).map(
    (d) => d.startsAt.getTime() + d.durationMinutes * 60_000,
  );
  return ends.length ? new Date(Math.max(...ends)) : null;
}

/**
 * Whether a seat holder is asked about this form. Someone who bought their
 * seat after the day had ended was not there for it, so they are not asked —
 * a Day 1 form does not go to someone who joined on Day 2.
 */
export function isEligible(seatGrantedAt: Date, endsAt: Date | null): boolean {
  return endsAt === null || seatGrantedAt.getTime() <= endsAt.getTime();
}

/** When the automatic email is due, or null if it never is on its own. */
export function emailDueAt(endsAt: Date | null, delayMinutes: number): Date | null {
  return endsAt ? new Date(endsAt.getTime() + delayMinutes * 60_000) : null;
}

/** What the website shows instead of a name. */
export const ANONYMOUS_ATTRIBUTION = 'A JSMF student';

/**
 * Whether a reply may appear on the website with its author's first name:
 * not when they hid their name from the team, and not when they answered
 * "no" to showing it (null = the form did not ask, so it may).
 */
export function nameMayBeShown(reply: { isAnonymous: boolean; showName: boolean | null }): boolean {
  return !reply.isAnonymous && reply.showName !== false;
}

/** Open, and not past its closing time. */
export function acceptsReplies(form: { status: FeedbackFormStatus; closesAt: Date | null }, now: Date): boolean {
  return form.status === FeedbackFormStatus.OPEN && (form.closesAt === null || form.closesAt.getTime() > now.getTime());
}

// --- answers --------------------------------------------------------------------

export interface QuestionForValidation {
  id: string;
  kind: FeedbackQuestionKind;
  label: string;
  required: boolean;
  options: string[];
}

/** One answer as sent by the form. Only the field for the question's kind is read. */
export interface AnswerInput {
  questionId: string;
  rating?: number | null;
  text?: string | null;
  choices?: string[] | null;
}

/** An answer ready to store: exactly one value set, matching the table's columns. */
export interface CleanAnswer {
  questionId: string;
  ratingValue: number | null;
  textValue: string | null;
  choiceValues: string[];
}

/**
 * Checks answers against the form's current questions and returns them ready
 * to store, or every problem found (all at once, so the student fixes them in
 * one go). An empty answer is the same as no answer: it is left out, which is
 * fine unless the question is required.
 */
export function cleanAnswers(
  questions: QuestionForValidation[],
  input: AnswerInput[],
): { answers: CleanAnswer[]; errors: string[] } {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const errors: string[] = [];
  const answers: CleanAnswer[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    const question = byId.get(raw.questionId);
    if (!question) {
      errors.push('One of the answers is for a question that is no longer on this form. Reload the page and try again.');
      continue;
    }
    if (seen.has(question.id)) {
      errors.push(`"${question.label}" was answered twice.`);
      continue;
    }
    seen.add(question.id);

    const result = cleanOne(question, raw);
    if (typeof result === 'string') errors.push(result);
    else if (result) answers.push(result);
  }

  const answered = new Set(answers.map((a) => a.questionId));
  for (const question of questions) {
    if (!question.required || answered.has(question.id)) continue;
    // Already told what is wrong with this one; "needs an answer" would be noise.
    if (errors.some((e) => e.startsWith(`"${question.label}"`))) continue;
    errors.push(`"${question.label}" needs an answer.`);
  }

  return { answers, errors: [...new Set(errors)] };
}

/** A clean answer, null for "left empty", or a message saying what is wrong. */
function cleanOne(question: QuestionForValidation, raw: AnswerInput): CleanAnswer | null | string {
  const empty = { questionId: question.id, ratingValue: null, textValue: null, choiceValues: [] as string[] };

  switch (question.kind) {
    case FeedbackQuestionKind.RATING:
    case FeedbackQuestionKind.SCALE: {
      if (raw.rating === null || raw.rating === undefined) return null;
      const range = RATING_RANGE[question.kind]!;
      if (!Number.isInteger(raw.rating) || raw.rating < range.min || raw.rating > range.max) {
        return `"${question.label}" must be a whole number from ${range.min} to ${range.max}.`;
      }
      return { ...empty, ratingValue: raw.rating };
    }

    case FeedbackQuestionKind.SHORT_TEXT:
    case FeedbackQuestionKind.LONG_TEXT: {
      const text = (raw.text ?? '').trim();
      if (!text) return null;
      const max = question.kind === FeedbackQuestionKind.SHORT_TEXT ? SHORT_TEXT_MAX : LONG_TEXT_MAX;
      if (text.length > max) return `"${question.label}" can be at most ${max} characters (yours is ${text.length}).`;
      return { ...empty, textValue: text };
    }

    case FeedbackQuestionKind.SINGLE_CHOICE:
    case FeedbackQuestionKind.MULTI_CHOICE: {
      const picked = [...new Set((raw.choices ?? []).map((c) => c.trim()).filter(Boolean))];
      if (picked.length === 0) return null;
      const unknown = picked.filter((c) => !question.options.includes(c));
      if (unknown.length) return `"${question.label}" has a choice that is not one of its options: ${unknown.join(', ')}.`;
      if (question.kind === FeedbackQuestionKind.SINGLE_CHOICE && picked.length > 1) {
        return `"${question.label}" takes one choice only.`;
      }
      // Stored in the form's order, not the order clicked, so exports read the same.
      return { ...empty, choiceValues: question.options.filter((o) => picked.includes(o)) };
    }
  }
}

// --- questions ----------------------------------------------------------------

export interface QuestionDraft {
  kind: FeedbackQuestionKind;
  label: string;
  helpText?: string | null;
  required?: boolean;
  options?: string[];
}

/** Problems with a question as an admin wrote it, or none. */
export function questionProblems(draft: QuestionDraft, position: number): string[] {
  const name = draft.label?.trim() ? `"${draft.label.trim()}"` : `Question ${position}`;
  const problems: string[] = [];
  if (!draft.label?.trim()) problems.push(`Question ${position} needs a question text.`);

  const isChoice =
    draft.kind === FeedbackQuestionKind.SINGLE_CHOICE || draft.kind === FeedbackQuestionKind.MULTI_CHOICE;
  const options = (draft.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (isChoice) {
    if (options.length < 2) problems.push(`${name} needs at least two choices.`);
    if (options.length > MAX_OPTIONS) problems.push(`${name} can have at most ${MAX_OPTIONS} choices.`);
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      problems.push(`${name} has the same choice twice.`);
    }
  }
  return problems;
}

/** Choices trimmed and blank ones dropped; none at all for a kind that has no choices. */
export function cleanOptions(draft: QuestionDraft): string[] {
  const isChoice =
    draft.kind === FeedbackQuestionKind.SINGLE_CHOICE || draft.kind === FeedbackQuestionKind.MULTI_CHOICE;
  return isChoice ? (draft.options ?? []).map((o) => o.trim()).filter(Boolean) : [];
}
