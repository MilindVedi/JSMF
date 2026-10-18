import { describe, expect, it } from 'vitest';
import { FeedbackFormStatus, FeedbackQuestionKind } from '@prisma/client';
import { feedbackLinkKey, readInviteToken, signInviteToken } from './feedback-link';
import {
  acceptsReplies,
  cleanAnswers,
  emailDueAt,
  formEndsAt,
  isEligible,
  questionProblems,
  type QuestionForValidation,
} from './feedback-rules';
import { summarise } from './feedback-summary';

const at = (iso: string) => new Date(iso);
const days = [
  { id: 'd1', startsAt: at('2026-10-10T13:30:00Z'), durationMinutes: 120 },
  { id: 'd2', startsAt: at('2026-10-11T13:30:00Z'), durationMinutes: 90 },
];

describe('when a form is due, and for whom', () => {
  it("ends at its day's end, or the last day's for a whole-session form", () => {
    expect(formEndsAt('d1', days)).toEqual(at('2026-10-10T15:30:00Z'));
    expect(formEndsAt(null, days)).toEqual(at('2026-10-11T15:00:00Z'));
    expect(formEndsAt(null, [])).toBeNull();
  });

  it('asks only people who had a seat by the time the day ended', () => {
    const end = formEndsAt('d1', days);
    expect(isEligible(at('2026-10-09T10:00:00Z'), end)).toBe(true);
    expect(isEligible(at('2026-10-10T15:30:00Z'), end)).toBe(true);
    expect(isEligible(at('2026-10-10T15:31:00Z'), end)).toBe(false);
    expect(isEligible(at('2030-01-01T00:00:00Z'), null)).toBe(true);
  });

  it('emails after the delay, and takes replies only while open', () => {
    expect(emailDueAt(at('2026-10-10T15:30:00Z'), 30)).toEqual(at('2026-10-10T16:00:00Z'));
    expect(emailDueAt(null, 30)).toBeNull();

    const now = at('2026-10-12T00:00:00Z');
    expect(acceptsReplies({ status: FeedbackFormStatus.OPEN, closesAt: null }, now)).toBe(true);
    expect(acceptsReplies({ status: FeedbackFormStatus.OPEN, closesAt: at('2026-10-11T00:00:00Z') }, now)).toBe(false);
    expect(acceptsReplies({ status: FeedbackFormStatus.DRAFT, closesAt: null }, now)).toBe(false);
    expect(acceptsReplies({ status: FeedbackFormStatus.CLOSED, closesAt: null }, now)).toBe(false);
  });
});

describe('answers', () => {
  const questions: QuestionForValidation[] = [
    { id: 'q1', kind: FeedbackQuestionKind.RATING, label: 'Overall', required: true, options: [] },
    { id: 'q2', kind: FeedbackQuestionKind.SINGLE_CHOICE, label: 'Pace', required: false, options: ['Slow', 'Right', 'Fast'] },
    { id: 'q3', kind: FeedbackQuestionKind.MULTI_CHOICE, label: 'Topics', required: false, options: ['A', 'B', 'C'] },
    { id: 'q4', kind: FeedbackQuestionKind.LONG_TEXT, label: 'Useful', required: false, options: [] },
    { id: 'q5', kind: FeedbackQuestionKind.SCALE, label: 'Recommend', required: false, options: [] },
  ];

  it('cleans valid answers into one typed value each, dropping empty ones', () => {
    const { answers, errors } = cleanAnswers(questions, [
      { questionId: 'q1', rating: 5 },
      { questionId: 'q2', choices: ['Right'] },
      { questionId: 'q3', choices: ['C', 'A', 'A'] },
      { questionId: 'q4', text: '   ' },
      { questionId: 'q5', rating: 0 },
    ]);
    expect(errors).toEqual([]);
    expect(answers).toEqual([
      { questionId: 'q1', ratingValue: 5, textValue: null, choiceValues: [] },
      { questionId: 'q2', ratingValue: null, textValue: null, choiceValues: ['Right'] },
      // In the form's order, duplicates gone.
      { questionId: 'q3', ratingValue: null, textValue: null, choiceValues: ['A', 'C'] },
      { questionId: 'q5', ratingValue: 0, textValue: null, choiceValues: [] },
    ]);
  });

  it('reports every problem at once', () => {
    const { errors } = cleanAnswers(questions, [
      { questionId: 'q1', rating: 6 },
      { questionId: 'q2', choices: ['Slow', 'Fast'] },
      { questionId: 'q3', choices: ['Z'] },
      { questionId: 'nope', text: 'x' },
      { questionId: 'q4', text: 'x'.repeat(5001) },
    ]);
    expect(errors).toHaveLength(5);
    expect(errors.join('\n')).toMatch(/Overall.*1 to 5/);
    expect(errors.join('\n')).toMatch(/Pace.*one choice/);
  });

  it('insists on a required question', () => {
    expect(cleanAnswers(questions, []).errors).toEqual(['"Overall" needs an answer.']);
    expect(cleanAnswers(questions, [{ questionId: 'q1', rating: null }]).errors).toEqual(['"Overall" needs an answer.']);
  });

  it('checks a choice question has real choices', () => {
    expect(questionProblems({ kind: FeedbackQuestionKind.SINGLE_CHOICE, label: 'Pace', options: ['Only'] }, 1)).toHaveLength(1);
    expect(questionProblems({ kind: FeedbackQuestionKind.SINGLE_CHOICE, label: 'Pace', options: ['a', 'A'] }, 1)).toHaveLength(1);
    expect(questionProblems({ kind: FeedbackQuestionKind.LONG_TEXT, label: ' ', options: [] }, 3)).toEqual([
      'Question 3 needs a question text.',
    ]);
  });
});

describe('summary', () => {
  it('averages ratings and counts choices, keeping renamed ones', () => {
    const [rating, pace] = summarise(
      [
        { id: 'q1', kind: FeedbackQuestionKind.RATING, options: [] },
        { id: 'q2', kind: FeedbackQuestionKind.SINGLE_CHOICE, options: ['Slow', 'Right'] },
      ],
      [
        { questionId: 'q1', ratingValue: 5, textValue: null, choiceValues: [] },
        { questionId: 'q1', ratingValue: 4, textValue: null, choiceValues: [] },
        { questionId: 'q1', ratingValue: 4, textValue: null, choiceValues: [] },
        { questionId: 'q2', ratingValue: null, textValue: null, choiceValues: ['Right'] },
        { questionId: 'q2', ratingValue: null, textValue: null, choiceValues: ['Too fast'] },
      ],
    );
    expect(rating).toMatchObject({ answered: 3, average: 4.3 });
    expect(rating.kind === 'RATING' && rating.distribution.map((d) => d.count)).toEqual([0, 0, 0, 2, 1]);
    expect(pace).toMatchObject({
      answered: 2,
      choices: [
        { label: 'Slow', count: 0, current: true },
        { label: 'Right', count: 1, current: true },
        { label: 'Too fast', count: 1, current: false },
      ],
    });
  });
});

describe('personal link', () => {
  const key = feedbackLinkKey({ storageSigningSecret: 'storage-secret-for-tests-0123' });
  const id = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

  it('round-trips, and rejects tampering or another key', () => {
    const token = signInviteToken(id, key);
    expect(readInviteToken(token, key)).toBe(id);
    expect(readInviteToken(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), key)).toBeNull();
    expect(readInviteToken(token.replace(id, '0192f3a4-5b6c-7d8e-9f01-23456789abce'), key)).toBeNull();
    expect(readInviteToken(token, feedbackLinkKey({ dedicated: 'another-dedicated-secret', storageSigningSecret: 'x' }))).toBeNull();
    expect(readInviteToken('not-a-token', key)).toBeNull();
  });

  it('derives a key different from the storage secret itself', () => {
    expect(key).not.toBe('storage-secret-for-tests-0123');
    expect(feedbackLinkKey({ dedicated: 'dedicated-secret-xyz', storageSigningSecret: 'whatever' })).toBe('dedicated-secret-xyz');
  });
});
