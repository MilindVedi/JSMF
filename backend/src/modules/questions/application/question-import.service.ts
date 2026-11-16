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
  /** Why this option is right or wrong. Omitted: unchanged; null clears it. */
  explanation?: string | null;
}

export interface ImportQuestion {
  externalKey: string;
  examSlug: string;
  subjectSlug: string;
  topicSlug?: string | null;
  year: number;
  /**
   * The exam session's month, 1–12 (FMGE June 2026: year 2026, 6). Omitted:
   * unchanged (none for a new question), so an older file re-imported keeps
   * a month set since; null clears it.
   */
  sessionMonth?: number | null;
  stem: string;
  stemImageUrl?: string | null;
  stemFigure?: Prisma.InputJsonValue | null;
  explanation: string;
  explanationImageUrl?: string | null;
  explanationFigure?: Prisma.InputJsonValue | null;
  /** High-yield pearls / buzzwords. Omitted: unchanged; [] clears them. */
  pearls?: string[];
  /** Omitted: unchanged; null clears it. */
  quickRevision?: string | null;
  difficulty: Difficulty;
  /** Omitted: new questions start as DRAFT, existing ones keep their status. */
  status?: QuestionStatus;
  /** Never shuffle the options. Omitted: unchanged (false for a new question). */
  keepOptionOrder?: boolean;
  options: ImportOption[];
}

export interface ImportInput {
  exams?: ImportExam[];
  subjects?: ImportSubject[];
  topics?: ImportTopic[];
  questions: ImportQuestion[];
}

/** Columns a caller of `writeQuestion` may set besides the imported content. */
export type QuestionExtraColumns = Partial<
  Pick<
    Prisma.QuestionUncheckedCreateInput,
    | 'stemImageStorageProvider'
    | 'stemImageBucket'
    | 'stemImageObjectKey'
    | 'explanationImageStorageProvider'
    | 'explanationImageBucket'
    | 'explanationImageObjectKey'
  >
>;

export interface ImportResult {
  exams: number;
  subjects: number;
  topics: number;
  created: number;
  updated: number;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Pearls as stored: trimmed, blanks dropped. */
export function cleanPearls(pearls: string[]): string[] {
  return pearls.map((pearl) => pearl.trim()).filter(Boolean);
}

/** `bone-tumors` → `Bone Tumors`, for a topic referenced but not described. */
function titleFromSlug(slug: string): string {
  return slug
    .split(/-+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The message for slugs used but neither known nor described, naming where
 * each is first used and what exists — or null when all are fine.
 */
function unknownReferences(
  kind: 'exam' | 'subject',
  list: 'exams' | 'subjects',
  uses: { slug: string; by: string }[],
  allowed: string[],
  existing: string[],
): string | null {
  const ok = new Set(allowed);
  const firstUse = new Map<string, string>();
  for (const use of uses) if (!ok.has(use.slug) && !firstUse.has(use.slug)) firstUse.set(use.slug, use.by);
  if (!firstUse.size) return null;
  const unknown = [...firstUse].map(([slug, by]) => `"${slug}" (${by})`).join(', ');
  return (
    `Unknown ${kind}${firstUse.size > 1 ? 's' : ''} ${unknown}. ` +
    `Use an existing ${kind} — ${existing.join(', ') || 'none yet'} — ` +
    `or describe a new one in the file's "${list}" list.`
  );
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
    await this.checkReferences(input);

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

      const written = await this.prisma.$transaction((tx) =>
        this.writeQuestion(tx, question, { examId, subjectId, topicId }),
      );
      if (written.created) created += 1;
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

  /**
   * Writes one question — its fields and options — in the caller's
   * transaction: updated in place when its `externalKey` exists, else created
   * (DRAFT unless it says otherwise). Options are updated by position, so
   * their ids — which students' past attempts point at — stay stable. Shared
   * with the release push (question-release.service.ts), which passes the id
   * a new question gets and its own extra columns.
   */
  async writeQuestion(
    tx: Prisma.TransactionClient,
    question: ImportQuestion,
    refs: { examId: string; subjectId: string; topicId: string | null },
    options: { id?: string; extra?: QuestionExtraColumns } = {},
  ): Promise<{ id: string; created: boolean }> {
    const fields = {
      ...refs,
      year: question.year,
      ...(question.sessionMonth !== undefined ? { sessionMonth: question.sessionMonth } : {}),
      stem: question.stem,
      stemImageUrl: question.stemImageUrl ?? null,
      stemFigure: question.stemFigure ?? Prisma.DbNull,
      explanation: question.explanation,
      explanationImageUrl: question.explanationImageUrl ?? null,
      explanationFigure: question.explanationFigure ?? Prisma.DbNull,
      ...(question.pearls !== undefined ? { pearls: cleanPearls(question.pearls) } : {}),
      ...(question.quickRevision !== undefined ? { quickRevision: question.quickRevision?.trim() || null } : {}),
      difficulty: question.difficulty,
      ...(question.keepOptionOrder !== undefined ? { keepOptionOrder: question.keepOptionOrder } : {}),
      ...options.extra,
    };

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
            ...(options.id ? { id: options.id } : {}),
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
        ...(option.explanation !== undefined ? { explanation: option.explanation?.trim() || null } : {}),
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

    return { id: row.id, created: !existing };
  }

  /** Whole-file checks first, so a bad row fails the import before anything is written. */
  private validate(input: ImportInput): void {
    this.validateQuestions(input.questions);
  }

  /** The per-question checks the DTO cannot express: unique keys, 2–6 options, exactly one correct. */
  validateQuestions(questions: ImportQuestion[]): void {
    const seen = new Set<string>();
    for (const question of questions) {
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

  /**
   * Every exam and subject a question or topic names must already exist, or be
   * described in the file's `exams` / `subjects` list. Never created from a
   * bare slug: a typo ("orthopaedics") would quietly become a second subject —
   * named from the slug, in the wrong group — splitting its questions and
   * students' stats. (The admin editor holds the same line.) Topics are still
   * created on first use: they grow with the content. Checked up front, so a
   * bad file writes nothing.
   */
  private async checkReferences(input: ImportInput): Promise<void> {
    const [exams, subjects] = await Promise.all([
      this.prisma.exam.findMany({ select: { slug: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.subject.findMany({ select: { slug: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    const problems = [
      unknownReferences(
        'exam',
        'exams',
        input.questions.map((q) => ({ slug: q.examSlug, by: `question ${q.externalKey}` })),
        [...(input.exams ?? []).map((e) => e.slug), ...exams.map((e) => e.slug)],
        exams.map((e) => e.slug),
      ),
      unknownReferences(
        'subject',
        'subjects',
        [
          ...input.questions.map((q) => ({ slug: q.subjectSlug, by: `question ${q.externalKey}` })),
          ...(input.topics ?? []).map((t) => ({ slug: t.subjectSlug, by: `topic ${t.slug}` })),
        ],
        [...(input.subjects ?? []).map((s) => s.slug), ...subjects.map((s) => s.slug)],
        subjects.map((s) => s.slug),
      ),
    ].filter(Boolean);
    if (problems.length) throw new BadRequestException(problems.join(' '));
  }

  /** Exams and subjects are known by now (checkReferences). */
  private async examId(slug: string, cache: Map<string, string>): Promise<string> {
    const known = cache.get(slug);
    if (known) return known;
    const row = await this.prisma.exam.findUniqueOrThrow({ where: { slug }, select: { id: true } });
    cache.set(slug, row.id);
    return row.id;
  }

  private async subjectId(slug: string, cache: Map<string, string>): Promise<string> {
    const known = cache.get(slug);
    if (known) return known;
    const row = await this.prisma.subject.findUniqueOrThrow({ where: { slug }, select: { id: true } });
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
