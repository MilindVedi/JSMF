import { Difficulty, QuestionStatus } from '@prisma/client';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import {
  QuestionImportService,
  type ImportQuestion,
} from '../src/modules/questions/application/question-import.service';

/**
 * Loads the PYQ web app's mock question bank (web/src/data/mock) into the
 * database through the same import service the admin endpoint uses, so the
 * seed exercises the real path and is idempotent the same way: run it again
 * and every row is updated in place, nothing duplicated.
 *
 * Questions are imported PUBLISHED — this is demo content for local
 * development, not pipeline output awaiting review.
 *
 * The mock files are loaded with a computed dynamic import so the backend's
 * type-check never follows them into the web app (whose `@/` alias means
 * something else there).
 */

interface MockExam {
  id: string;
  name: string;
  shortName: string;
  description: string;
}
interface MockSubject {
  id: string;
  name: string;
  slug: string;
  group: string;
  description?: string;
}
interface MockTopic {
  id: string;
  subjectId: string;
  name: string;
}
interface MockQuestion {
  id: string;
  examId: string;
  year: number;
  subjectId: string;
  topicId: string;
  stem: string;
  stemFigure?: { kind: string; caption: string };
  options: { id: string; text: string; imageUrl?: string }[];
  correctOptionId: string;
  explanation: string;
  explanationFigure?: { kind: string; caption: string };
  difficulty: 'easy' | 'medium' | 'hard';
}

const MOCK_ROOT = resolve(__dirname, '../../web/src/data/mock');

async function load<T>(file: string, name: string): Promise<T> {
  const url = pathToFileURL(resolve(MOCK_ROOT, file)).href;
  const mod = (await import(url)) as Record<string, unknown>;
  if (!(name in mod)) throw new Error(`${file} does not export ${name}`);
  return mod[name] as T;
}

async function main() {
  const [exams, subjects, topics, questions] = await Promise.all([
    load<MockExam[]>('exams.ts', 'EXAMS'),
    load<MockSubject[]>('subjects.ts', 'SUBJECTS'),
    load<MockTopic[]>('topics.ts', 'TOPICS'),
    load<MockQuestion[]>('questions/index.ts', 'QUESTIONS'),
  ]);

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const importer = new QuestionImportService(prisma);
    const result = await importer.import(
      {
        exams: exams.map((exam, index) => ({
          slug: exam.id,
          name: exam.name,
          shortName: exam.shortName,
          description: exam.description,
          sortOrder: index,
        })),
        subjects: subjects.map((subject, index) => ({
          slug: subject.slug,
          name: subject.name,
          group: subject.group,
          description: subject.description ?? null,
          sortOrder: index,
        })),
        topics: topics.map((topic, index) => ({
          slug: topic.id,
          subjectSlug: topic.subjectId,
          name: topic.name,
          sortOrder: index,
        })),
        questions: questions.map((question): ImportQuestion => ({
          externalKey: question.id,
          examSlug: question.examId,
          subjectSlug: question.subjectId,
          topicSlug: question.topicId,
          year: question.year,
          stem: question.stem,
          stemFigure: question.stemFigure ?? null,
          explanation: question.explanation,
          explanationFigure: question.explanationFigure ?? null,
          difficulty: question.difficulty.toUpperCase() as Difficulty,
          status: QuestionStatus.PUBLISHED,
          options: question.options.map((option) => ({
            text: option.text,
            imageUrl: option.imageUrl ?? null,
            isCorrect: option.id === question.correctOptionId,
          })),
        })),
      },
      null,
    );

    const counts = {
      exams: await prisma.exam.count(),
      subjects: await prisma.subject.count(),
      topics: await prisma.topic.count(),
      questions: await prisma.question.count(),
      options: await prisma.questionOption.count(),
    };
    console.log('PYQ import:', result);
    console.log('PYQ tables now hold:', counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
