import { Difficulty, Prisma } from '@prisma/client';

/**
 * How a question leaves this API. Shapes mirror the PYQ web app's `Question`
 * type (web/src/types) so the frontend swaps its mock for these responses with
 * little change: taxonomy is addressed by slug (`examId: "neet-pg"`),
 * difficulty is lower-case.
 *
 * Two shapes, and the split is the security boundary: `toQuestionView` never
 * carries the answer or the explanation; only `toAnsweredQuestionView` does,
 * and callers reach for it only once the student is allowed to see the answer.
 */

export const QUESTION_VIEW_INCLUDE = {
  exam: { select: { slug: true } },
  subject: { select: { slug: true } },
  topic: { select: { slug: true } },
  options: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.QuestionInclude;

export type QuestionWithRelations = Prisma.QuestionGetPayload<{
  include: typeof QUESTION_VIEW_INCLUDE;
}>;

export interface QuestionView {
  id: string;
  externalKey: string;
  examId: string;
  year: number;
  subjectId: string;
  topicId: string | null;
  stem: string;
  stemImageUrl: string | null;
  stemFigure: Prisma.JsonValue | null;
  options: {
    id: string;
    label: string;
    text: string;
    imageUrl: string | null;
  }[];
  difficulty: Lowercase<Difficulty>;
}

export interface AnsweredQuestionView extends QuestionView {
  correctOptionId: string | null;
  explanation: string;
  explanationImageUrl: string | null;
  explanationFigure: Prisma.JsonValue | null;
}

export function toDifficulty(value: Difficulty): Lowercase<Difficulty> {
  return value.toLowerCase() as Lowercase<Difficulty>;
}

export function toQuestionView(question: QuestionWithRelations): QuestionView {
  return {
    id: question.id,
    externalKey: question.externalKey,
    examId: question.exam.slug,
    year: question.year,
    subjectId: question.subject.slug,
    topicId: question.topic?.slug ?? null,
    stem: question.stem,
    stemImageUrl: question.stemImageUrl,
    stemFigure: question.stemFigure,
    // Explicit field list — spreading the row would leak isCorrect.
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      text: option.text,
      imageUrl: option.imageUrl,
    })),
    difficulty: toDifficulty(question.difficulty),
  };
}

export function toAnsweredQuestionView(question: QuestionWithRelations): AnsweredQuestionView {
  return {
    ...toQuestionView(question),
    correctOptionId: question.options.find((option) => option.isCorrect)?.id ?? null,
    explanation: question.explanation,
    explanationImageUrl: question.explanationImageUrl,
    explanationFigure: question.explanationFigure,
  };
}

/** Students only ever see published, undeleted questions. */
export const VISIBLE_QUESTION: Prisma.QuestionWhereInput = {
  status: 'PUBLISHED',
  deletedAt: null,
};

/** Midnight India time, as an instant — the boundary of a "day" for allowances and trends. */
export function startOfIndiaDay(now: Date = new Date()): Date {
  const IST_OFFSET_MS = 330 * 60_000;
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}
