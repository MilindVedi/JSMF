import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Difficulty, Prisma, QuestionStatus } from '@prisma/client';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface ImportExam {
  slug: string;
  name: string;
  shortName?: string;
  description?: string | null;
  sortOrder?: number;
}

export interface ImportSubject {
  slug: string;
  name: string;
  group: string;
  description?: string | null;
  sortOrder?: number;
}

export interface ImportTopic {
  slug: string;
  subjectSlug: string;
  name: string;
  sortOrder?: number;
}

export interface ImportOption {
  text: string;
  imageUrl?: string | null;
  isCorrect: boolean;
}

export interface ImportQuestion {
  externalKey: string;
  examSlug: string;
  subjectSlug: string;
  topicSlug?: string | null;
  year: number;
  stem: string;
  stemImageUrl?: string | null;
  stemFigure?: Prisma.InputJsonValue | null;
  explanation: string;
  explanationImageUrl?: string | null;
  explanationFigure?: Prisma.InputJsonValue | null;
  difficulty: Difficulty;
  /** Omitted: new questions start as DRAFT, existing ones keep their status. */
  status?: QuestionStatus;
  options: ImportOption[];
}

export interface ImportInput {
  exams?: ImportExam[];
  subjects?: ImportSubject[];
  topics?: ImportTopic[];
  questions: ImportQuestion[];
}

export interface ImportResult {
  exams: number;
  subjects: number;
  topics: number;
  created: number;
  updated: number;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** `general-medicine` → `General Medicine`, for taxonomy referenced but not described. */
function titleFromSlug(slug: string): string {
  return slug
    .split(/-+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Loads questions from the content pipeline.
 *
 * Idempotent by construction: taxonomy is upserted on slug and questions on
 * `externalKey`, so the same file imported twice changes nothing the second
 * time. Options are updated in place by position rather than replaced, which
 * keeps their ids stable — a student's past attempt still points at the
 * option they actually chose after a typo fix.
 */
@Injectable()
export class QuestionImportService {
  private readonly logger = new Logger(QuestionImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async import(input: ImportInput, actorId: string | null = null): Promise<ImportResult> {
    this.validate(input);

    const examIds = new Map<string, string>();
    const subjectIds = new Map<string, string>();
    const topicIds = new Map<string, { id: string; subjectId: string }>();

    for (const exam of input.exams ?? []) {
      const data = {
        name: exam.name,
        shortName: exam.shortName ?? exam.name,
        description: exam.description ?? null,
        sortOrder: exam.sortOrder ?? 0,
      };
      const row = await this.prisma.exam.upsert({
        where: { slug: exam.slug },
        create: { slug: exam.slug, ...data },
        update: data,
      });
      examIds.set(row.slug, row.id);
    }

    for (const subject of input.subjects ?? []) {
      const data = {
        name: subject.name,
        group: subject.group,
        description: subject.description ?? null,
        sortOrder: subject.sortOrder ?? 0,
      };
      const row = await this.prisma.subject.upsert({
        where: { slug: subject.slug },
        create: { slug: subject.slug, ...data },
        update: data,
      });
      subjectIds.set(row.slug, row.id);
    }

    for (const topic of input.topics ?? []) {
      const subjectId = await this.subjectId(topic.subjectSlug, subjectIds);
      const data = {
        subjectId,
        name: topic.name,
        sortOrder: topic.sortOrder ?? 0,
      };
      const row = await this.prisma.topic.upsert({
        where: { slug: topic.slug },
        create: { slug: topic.slug, ...data },
        update: data,
      });
      topicIds.set(row.slug, { id: row.id, subjectId: row.subjectId });
    }

    let created = 0;
    let updated = 0;

    for (const question of input.questions) {
      const examId = await this.examId(question.examSlug, examIds);
      const subjectId = await this.subjectId(question.subjectSlug, subjectIds);
      const topicId = question.topicSlug
        ? await this.topicId(question.topicSlug, subjectId, topicIds)
        : null;

      const fields = {
        examId,
        subjectId,
        topicId,
        year: question.year,
        stem: question.stem,
        stemImageUrl: question.stemImageUrl ?? null,
        stemFigure: question.stemFigure ?? Prisma.DbNull,
        explanation: question.explanation,
        explanationImageUrl: question.explanationImageUrl ?? null,
        explanationFigure: question.explanationFigure ?? Prisma.DbNull,
        difficulty: question.difficulty,
      };

      const wasNew = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.question.findUnique({
          where: { externalKey: question.externalKey },
          select: { id: true },
        });

        const row = existing
          ? await tx.question.update({
              where: { id: existing.id },
              data: {
                ...fields,
                ...(question.status ? { status: question.status } : {}),
              },
            })
          : await tx.question.create({
              data: {
                externalKey: question.externalKey,
                ...fields,
                status: question.status ?? QuestionStatus.DRAFT,
              },
            });

        for (const [index, option] of question.options.entries()) {
          const data = {
            label: OPTION_LABELS[index],
            text: option.text,
            imageUrl: option.imageUrl ?? null,
            isCorrect: option.isCorrect,
          };
          await tx.questionOption.upsert({
            where: {
              questionId_sortOrder: { questionId: row.id, sortOrder: index },
            },
            create: { questionId: row.id, sortOrder: index, ...data },
            update: data,
          });
        }
        await tx.questionOption.deleteMany({
          where: {
            questionId: row.id,
            sortOrder: { gte: question.options.length },
          },
        });

        return !existing;
      });

      if (wasNew) created += 1;
      else updated += 1;
    }

    const result: ImportResult = {
      exams: examIds.size,
      subjects: subjectIds.size,
      topics: topicIds.size,
      created,
      updated,
    };
    activity(this.logger, 'questions.imported', { actorId, ...result });
    return result;
  }

  /** Whole-file checks first, so a bad row fails the import before anything is written. */
  private validate(input: ImportInput): void {
    const seen = new Set<string>();
    for (const question of input.questions) {
      const where = `Question ${question.externalKey}`;
      if (seen.has(question.externalKey)) {
        throw new BadRequestException(`${where} appears more than once in this import`);
      }
      seen.add(question.externalKey);
      if (question.options.length < 2 || question.options.length > OPTION_LABELS.length) {
        throw new BadRequestException(
          `${where} needs between 2 and ${OPTION_LABELS.length} options`,
        );
      }
      if (question.options.filter((option) => option.isCorrect).length !== 1) {
        throw new BadRequestException(`${where} must have exactly one correct option`);
      }
    }
  }

  private async examId(slug: string, cache: Map<string, string>): Promise<string> {
    const known = cache.get(slug);
    if (known) return known;
    const row = await this.prisma.exam.upsert({
      where: { slug },
      create: { slug, name: slug.toUpperCase(), shortName: slug.toUpperCase() },
      update: {},
    });
    cache.set(slug, row.id);
    return row.id;
  }

  private async subjectId(slug: string, cache: Map<string, string>): Promise<string> {
    const known = cache.get(slug);
    if (known) return known;
    const row = await this.prisma.subject.upsert({
      where: { slug },
      create: { slug, name: titleFromSlug(slug), group: 'clinical' },
      update: {},
    });
    cache.set(slug, row.id);
    return row.id;
  }

  private async topicId(
    slug: string,
    subjectId: string,
    cache: Map<string, { id: string; subjectId: string }>,
  ): Promise<string> {
    const row =
      cache.get(slug) ??
      (await this.prisma.topic.upsert({
        where: { slug },
        create: {
          slug,
          subjectId,
          name: titleFromSlug(slug.split('--').pop() ?? slug),
        },
        update: {},
      }));
    if (row.subjectId !== subjectId) {
      throw new BadRequestException(`Topic ${slug} belongs to a different subject`);
    }
    cache.set(slug, { id: row.id, subjectId: row.subjectId });
    return row.id;
  }
}
