import { FeedbackQuestionKind } from '@prisma/client';
import type { QuestionDraft } from './feedback-rules';

/**
 * Ready-made forms an admin can start from, so nobody writes questions from a
 * blank page. Code, not table rows: they change with the product, are the
 * same for everyone, and need no admin screen of their own. An admin's own
 * "template" is simply an earlier form, which any new form can copy.
 *
 * Short on purpose: every extra question costs replies.
 */
export interface FeedbackTemplate {
  key: string;
  name: string;
  /** One line for the picker. */
  description: string;
  /** Used when the admin gives no title. `{day}` becomes "Day 2", or "Session". */
  title: string;
  intro?: string;
  questions: QuestionDraft[];
}

const { RATING, SCALE, SHORT_TEXT, LONG_TEXT, SINGLE_CHOICE, MULTI_CHOICE } = FeedbackQuestionKind;

const RECOMMEND: QuestionDraft = {
  kind: SCALE,
  label: 'How likely are you to recommend JSMF to a friend?',
  helpText: '0 = not at all likely, 10 = extremely likely',
};

export const FEEDBACK_TEMPLATES: FeedbackTemplate[] = [
  {
    key: 'day-standard',
    name: 'After a class (standard)',
    description: 'Rating, pace, what helped, what to improve, recommend. About a minute.',
    title: '{day} feedback',
    intro: 'Two minutes, and it really helps us plan the next class.',
    questions: [
      { kind: RATING, label: 'How would you rate this class overall?', required: true },
      { kind: SINGLE_CHOICE, label: 'How was the pace?', options: ['Too slow', 'Just right', 'Too fast'] },
      { kind: LONG_TEXT, label: 'What was most useful for you?' },
      { kind: LONG_TEXT, label: 'What could we do better?' },
      RECOMMEND,
    ],
  },
  {
    key: 'quick-pulse',
    name: 'Quick pulse',
    description: 'Two questions: a star rating and one line. For when you want the most replies.',
    title: '{day}: quick feedback',
    questions: [
      { kind: RATING, label: 'How was today’s class?', required: true },
      { kind: SHORT_TEXT, label: 'One thing you will remember from it?' },
    ],
  },
  {
    key: 'day-detailed',
    name: 'Detailed class review',
    description: 'Content, clarity, doubts, topics for next time. Better for Day 1 of a new format.',
    title: '{day} feedback',
    questions: [
      { kind: RATING, label: 'How would you rate this class overall?', required: true },
      { kind: RATING, label: 'How clearly were the concepts explained?' },
      { kind: RATING, label: 'How useful were the examples and questions discussed?' },
      { kind: SINGLE_CHOICE, label: 'How was the pace?', options: ['Too slow', 'Just right', 'Too fast'] },
      { kind: SINGLE_CHOICE, label: 'Were your doubts answered?', options: ['Yes, all of them', 'Some of them', 'Not really', 'I had none'] },
      {
        kind: MULTI_CHOICE,
        label: 'What should we spend more time on next?',
        options: ['Concepts', 'Solving PYQs', 'Mnemonics & tricks', 'Revision strategy', 'Doubt clearing'],
      },
      { kind: LONG_TEXT, label: 'What was most useful for you?' },
      { kind: LONG_TEXT, label: 'Anything we should change?' },
    ],
  },
  {
    key: 'session-final',
    name: 'End of the whole session',
    description: 'After the last day: the session as a whole, what next, a testimonial.',
    title: 'How was the session?',
    intro: 'Thank you for being part of every day. One last minute of your time?',
    questions: [
      { kind: RATING, label: 'How would you rate the session as a whole?', required: true },
      { kind: SINGLE_CHOICE, label: 'Was it worth the time you put in?', options: ['Absolutely', 'Mostly', 'Not really'] },
      { kind: LONG_TEXT, label: 'What changed in how you prepare, after this session?' },
      {
        kind: MULTI_CHOICE,
        label: 'What would you join next?',
        options: ['Another live session', 'A 1:1 call with Dr. Angad', 'Subject-wise crash course', 'PYQ practice'],
      },
      RECOMMEND,
      { kind: LONG_TEXT, label: 'In a few lines, what would you tell a friend about it?', helpText: 'We may share this on our website.' },
    ],
  },
  {
    key: 'recommend-only',
    name: 'Recommend score only',
    description: 'A single 0–10 question and a reason. To track how much people would recommend JSMF over time.',
    title: '{day}: one question',
    questions: [{ ...RECOMMEND, required: true }, { kind: SHORT_TEXT, label: 'What is the main reason for your score?' }],
  },
];

export const DEFAULT_TEMPLATE = FEEDBACK_TEMPLATES[0];

export function templateByKey(key: string): FeedbackTemplate | undefined {
  return FEEDBACK_TEMPLATES.find((t) => t.key === key);
}
