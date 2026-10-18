import { FeedbackQuestionKind } from '@prisma/client';

/**
 * The results page's numbers, per question: average and spread for ratings,
 * counts per choice, how many wrote something for text. Pure, so the same
 * figures come out whether the page or a test asks.
 */

export interface SummaryQuestion {
  id: string;
  kind: FeedbackQuestionKind;
  options: string[];
}

export interface SummaryAnswer {
  questionId: string;
  ratingValue: number | null;
  textValue: string | null;
  choiceValues: string[];
}

export type QuestionSummary =
  | {
      questionId: string;
      kind: 'RATING' | 'SCALE';
      answered: number;
      /** Rounded to one decimal place; null with no answers. */
      average: number | null;
      /** Count per value, every value in range present (zeros included) so a chart needs no gaps filled. */
      distribution: Array<{ value: number; count: number }>;
    }
  | {
      questionId: string;
      kind: 'SINGLE_CHOICE' | 'MULTI_CHOICE';
      answered: number;
      /** The current choices first, in order; then any older choice that was renamed or removed. */
      choices: Array<{ label: string; count: number; current: boolean }>;
    }
  | { questionId: string; kind: 'SHORT_TEXT' | 'LONG_TEXT'; answered: number };

const RANGES = {
  RATING: { min: 1, max: 5 },
  SCALE: { min: 0, max: 10 },
} as const;

export function summarise(questions: SummaryQuestion[], answers: SummaryAnswer[]): QuestionSummary[] {
  const byQuestion = new Map<string, SummaryAnswer[]>();
  for (const answer of answers) {
    const list = byQuestion.get(answer.questionId) ?? [];
    list.push(answer);
    byQuestion.set(answer.questionId, list);
  }

  return questions.map((question): QuestionSummary => {
    const given = byQuestion.get(question.id) ?? [];

    switch (question.kind) {
      case FeedbackQuestionKind.RATING:
      case FeedbackQuestionKind.SCALE: {
        const values = given.map((a) => a.ratingValue).filter((v): v is number => v !== null);
        const { min, max } = RANGES[question.kind];
        const distribution = Array.from({ length: max - min + 1 }, (_, i) => ({
          value: min + i,
          count: values.filter((v) => v === min + i).length,
        }));
        const average = values.length
          ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
          : null;
        return { questionId: question.id, kind: question.kind, answered: values.length, average, distribution };
      }

      case FeedbackQuestionKind.SINGLE_CHOICE:
      case FeedbackQuestionKind.MULTI_CHOICE: {
        const counts = new Map<string, number>();
        for (const answer of given) {
          for (const choice of answer.choiceValues) counts.set(choice, (counts.get(choice) ?? 0) + 1);
        }
        const current = question.options.map((label) => ({ label, count: counts.get(label) ?? 0, current: true }));
        const older = [...counts.entries()]
          .filter(([label]) => !question.options.includes(label))
          .map(([label, count]) => ({ label, count, current: false }));
        return {
          questionId: question.id,
          kind: question.kind,
          answered: given.filter((a) => a.choiceValues.length > 0).length,
          choices: [...current, ...older],
        };
      }

      case FeedbackQuestionKind.SHORT_TEXT:
      case FeedbackQuestionKind.LONG_TEXT:
        return { questionId: question.id, kind: question.kind, answered: given.filter((a) => a.textValue).length };
    }
  });
}
