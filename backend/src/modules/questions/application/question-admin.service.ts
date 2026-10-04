import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Difficulty,
  Prisma,
  QuestionReportStatus,
  QuestionStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { activity } from "../../../shared/logging/activity";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import {
  QUESTION_VIEW_INCLUDE,
  type QuestionWithRelations,
  toAnsweredQuestionView,
} from "../domain/question-view";

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export interface AdminOptionInput {
  id?: string;
  text: string;
  imageUrl?: string | null;
  isCorrect: boolean;
}

export interface AdminQuestionInput {
  externalKey?: string;
  /** Taxonomy by slug, like the rest of the PYQ API. */
  examId: string;
  subjectId: string;
  topicId?: string | null;
  year: number;
  stem: string;
  stemImageUrl?: string | null;
  explanation: string;
  explanationImageUrl?: string | null;
  difficulty: Difficulty;
  status?: QuestionStatus;
  options: AdminOptionInput[];
}

export interface AdminQuestionFilters {
  examId?: string;
  subjectId?: string;
  topicId?: string;
  status?: QuestionStatus;
  q?: string;
  /** Only questions with at least one OPEN report. */
  reported?: boolean;
}

/**
 * Content editing for the PYQ bank: the admin-side counterpart of
 * QuestionBankService.
 *
 * Two rules protect students' history. Deleting is soft (`deletedAt`), so
 * sessions, attempts and reviews that point at a question keep working —
 * students simply stop being offered it. And options are edited in place by
 * id: an option some student has chosen can be reworded but never removed,
 * otherwise their past answer would point at nothing.
 */
@Injectable()
export class QuestionAdminService {
  private readonly logger = new Logger(QuestionAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(filters: AdminQuestionFilters, page: number, pageSize: number) {
    const and: Prisma.QuestionWhereInput[] = [{ deletedAt: null }];
    if (filters.examId) and.push({ exam: { slug: filters.examId } });
    if (filters.subjectId) and.push({ subject: { slug: filters.subjectId } });
    if (filters.topicId) and.push({ topic: { slug: filters.topicId } });
    if (filters.status) and.push({ status: filters.status });
    if (filters.q?.trim()) {
      and.push({ stem: { contains: filters.q.trim(), mode: "insensitive" } });
    }
    if (filters.reported) {
      and.push({ reports: { some: { status: QuestionReportStatus.OPEN } } });
    }
    const where: Prisma.QuestionWhereInput = { AND: and };

    const [total, rows] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        include: QUESTION_VIEW_INCLUDE,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const counts = await this.reportCounts(rows.map((row) => row.id));
    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => this.view(row, counts.get(row.id))),
    };
  }

  async get(id: string) {
    const row = await this.prisma.question.findFirst({
      where: { id, deletedAt: null },
      include: QUESTION_VIEW_INCLUDE,
    });
    if (!row) throw new NotFoundException("Question not found");
    const counts = await this.reportCounts([id]);
    return this.view(row, counts.get(id));
  }

  async create(input: AdminQuestionInput, actorId: string) {
    this.validateOptions(input.options);
    if (input.options.some((option) => option.id)) {
      throw new BadRequestException(
        "A new question cannot reuse existing option ids",
      );
    }
    const taxonomy = await this.resolveTaxonomy(
      input.examId,
      input.subjectId,
      input.topicId,
    );
    const externalKey = input.externalKey?.trim() || `admin-${randomUUID()}`;
    const clash = await this.prisma.question.findUnique({
      where: { externalKey },
    });
    if (clash)
      throw new ConflictException(
        `External key ${externalKey} is already used`,
      );

    const row = await this.prisma.question.create({
      data: {
        externalKey,
        ...taxonomy,
        year: input.year,
        stem: input.stem,
        stemImageUrl: input.stemImageUrl ?? null,
        explanation: input.explanation,
        explanationImageUrl: input.explanationImageUrl ?? null,
        difficulty: input.difficulty,
        status: input.status ?? QuestionStatus.DRAFT,
        options: {
          create: input.options.map((option, index) => ({
            label: OPTION_LABELS[index],
            text: option.text,
            imageUrl: option.imageUrl ?? null,
            isCorrect: option.isCorrect,
            sortOrder: index,
          })),
        },
      },
      include: QUESTION_VIEW_INCLUDE,
    });
    activity(this.logger, "pyq.question_created", {
      actorId,
      questionId: row.id,
      externalKey,
    });
    return this.view(row, undefined);
  }

  async update(
    id: string,
    input: Partial<AdminQuestionInput>,
    actorId: string,
  ) {
    const existing = await this.prisma.question.findFirst({
      where: { id, deletedAt: null },
      include: QUESTION_VIEW_INCLUDE,
    });
    if (!existing) throw new NotFoundException("Question not found");

    const data: Prisma.QuestionUncheckedUpdateInput = {};
    if (
      input.examId !== undefined ||
      input.subjectId !== undefined ||
      input.topicId !== undefined
    ) {
      Object.assign(
        data,
        await this.resolveTaxonomy(
          input.examId ?? existing.exam.slug,
          input.subjectId ?? existing.subject.slug,
          input.topicId === undefined
            ? (existing.topic?.slug ?? null)
            : input.topicId,
        ),
      );
    }
    if (input.year !== undefined) data.year = input.year;
    if (input.stem !== undefined) data.stem = input.stem;
    if (input.stemImageUrl !== undefined)
      data.stemImageUrl = input.stemImageUrl;
    if (input.explanation !== undefined) data.explanation = input.explanation;
    if (input.explanationImageUrl !== undefined) {
      data.explanationImageUrl = input.explanationImageUrl;
    }
    if (input.difficulty !== undefined) data.difficulty = input.difficulty;

    if (input.options) {
      this.validateOptions(input.options);
      const known = new Set(existing.options.map((option) => option.id));
      const unknown = input.options.find(
        (option) => option.id && !known.has(option.id),
      );
      if (unknown)
        throw new BadRequestException(
          `Option ${unknown.id} is not on this question`,
        );

      const kept = new Set(
        input.options.flatMap((option) => (option.id ? [option.id] : [])),
      );
      const removed = existing.options.filter((option) => !kept.has(option.id));
      if (removed.length) {
        const chosen = await this.prisma.attempt.count({
          where: {
            selectedOptionId: { in: removed.map((option) => option.id) },
          },
        });
        if (chosen > 0) {
          throw new ConflictException(
            "Students have chosen an option you removed; reword it instead of removing it",
          );
        }
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.question.update({ where: { id }, data });
      if (input.options) {
        const options = input.options;
        const keptIds = options.flatMap((option) =>
          option.id ? [option.id] : [],
        );
        await tx.questionOption.deleteMany({
          where: { questionId: id, id: { notIn: keptIds } },
        });
        // Park kept options out of the way so the (questionId, sortOrder)
        // unique index does not trip while they are being reordered.
        for (const [index, optionId] of keptIds.entries()) {
          await tx.questionOption.update({
            where: { id: optionId },
            data: { sortOrder: 1000 + index },
          });
        }
        for (const [index, option] of options.entries()) {
          const fields = {
            label: OPTION_LABELS[index],
            text: option.text,
            imageUrl: option.imageUrl ?? null,
            isCorrect: option.isCorrect,
            sortOrder: index,
          };
          if (option.id) {
            await tx.questionOption.update({
              where: { id: option.id },
              data: fields,
            });
          } else {
            await tx.questionOption.create({
              data: { questionId: id, ...fields },
            });
          }
        }
      }
      return tx.question.findUniqueOrThrow({
        where: { id },
        include: QUESTION_VIEW_INCLUDE,
      });
    });

    activity(this.logger, "pyq.question_updated", {
      actorId,
      questionId: id,
      fields: Object.keys(input).filter(
        (key) => input[key as keyof AdminQuestionInput] !== undefined,
      ),
    });
    const counts = await this.reportCounts([id]);
    return this.view(row, counts.get(id));
  }

  async setStatus(id: string, status: QuestionStatus, actorId: string) {
    const existing = await this.prisma.question.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Question not found");
    const row = await this.prisma.question.update({
      where: { id },
      data: { status },
      include: QUESTION_VIEW_INCLUDE,
    });
    activity(this.logger, "pyq.question_status_changed", {
      actorId,
      questionId: id,
      status,
    });
    const counts = await this.reportCounts([id]);
    return this.view(row, counts.get(id));
  }

  /** Soft delete: hidden from students and admin lists; history keeps pointing at it. */
  async remove(id: string, actorId: string): Promise<void> {
    const updated = await this.prisma.question.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (updated.count === 0) throw new NotFoundException("Question not found");
    activity(this.logger, "pyq.question_deleted", { actorId, questionId: id });
  }

  // --- Reports --------------------------------------------------------------

  async listReports(
    filters: { status?: QuestionReportStatus; questionId?: string },
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.QuestionReportWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.questionId ? { questionId: filters.questionId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.questionReport.count({ where }),
      this.prisma.questionReport.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
          resolvedBy: { select: { id: true, name: true, email: true } },
          question: {
            select: {
              id: true,
              stem: true,
              status: true,
              deletedAt: true,
              subject: { select: { slug: true } },
            },
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        details: row.details,
        status: row.status,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt,
        adminNote: row.adminNote,
        resolvedBy: row.resolvedBy,
        reporter: row.user,
        question: {
          id: row.question.id,
          stem: row.question.stem,
          status: row.question.status,
          deleted: row.question.deletedAt !== null,
          subjectId: row.question.subject.slug,
        },
      })),
    };
  }

  async resolveReport(
    id: string,
    outcome: "RESOLVED" | "DISMISSED",
    note: string | undefined,
    actorId: string,
  ) {
    const report = await this.prisma.questionReport.findUnique({
      where: { id },
    });
    if (!report) throw new NotFoundException("Report not found");
    if (report.status !== QuestionReportStatus.OPEN) {
      throw new ConflictException(
        `Report is already ${report.status.toLowerCase()}`,
      );
    }
    const row = await this.prisma.questionReport.update({
      where: { id },
      data: {
        status: outcome,
        resolvedAt: new Date(),
        adminNote: note?.trim() || null,
        resolvedById: actorId,
      },
    });
    activity(
      this.logger,
      outcome === "RESOLVED" ? "pyq.report_resolved" : "pyq.report_dismissed",
      {
        actorId,
        reportId: id,
        questionId: row.questionId,
        note: row.adminNote ?? undefined,
      },
    );
    return {
      id: row.id,
      status: row.status,
      resolvedAt: row.resolvedAt,
      reason: row.reason,
      adminNote: row.adminNote,
      resolvedById: row.resolvedById,
    };
  }

  // --- Helpers --------------------------------------------------------------

  private validateOptions(options: AdminOptionInput[]): void {
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      throw new BadRequestException(
        `A question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`,
      );
    }
    if (options.filter((option) => option.isCorrect).length !== 1) {
      throw new BadRequestException(
        "A question must have exactly one correct option",
      );
    }
    if (options.some((option) => !option.text.trim())) {
      throw new BadRequestException("Every option needs text");
    }
    const ids = options.flatMap((option) => (option.id ? [option.id] : []));
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("An option appears twice");
    }
  }

  private async resolveTaxonomy(
    examSlug: string,
    subjectSlug: string,
    topicSlug?: string | null,
  ) {
    const [exam, subject, topic] = await Promise.all([
      this.prisma.exam.findUnique({ where: { slug: examSlug } }),
      this.prisma.subject.findUnique({ where: { slug: subjectSlug } }),
      topicSlug
        ? this.prisma.topic.findUnique({ where: { slug: topicSlug } })
        : null,
    ]);
    if (!exam) throw new BadRequestException(`Unknown exam ${examSlug}`);
    if (!subject)
      throw new BadRequestException(`Unknown subject ${subjectSlug}`);
    if (topicSlug && !topic)
      throw new BadRequestException(`Unknown topic ${topicSlug}`);
    if (topic && topic.subjectId !== subject.id) {
      throw new BadRequestException(
        `Topic ${topicSlug} belongs to a different subject`,
      );
    }
    return {
      examId: exam.id,
      subjectId: subject.id,
      topicId: topic?.id ?? null,
    };
  }

  private async reportCounts(questionIds: string[]) {
    const counts = new Map<string, { open: number; total: number }>();
    if (questionIds.length === 0) return counts;
    const rows = await this.prisma.questionReport.groupBy({
      by: ["questionId", "status"],
      where: { questionId: { in: questionIds } },
      _count: true,
    });
    for (const row of rows) {
      const entry = counts.get(row.questionId) ?? { open: 0, total: 0 };
      entry.total += row._count;
      if (row.status === QuestionReportStatus.OPEN) entry.open += row._count;
      counts.set(row.questionId, entry);
    }
    return counts;
  }

  private view(
    row: QuestionWithRelations,
    reports: { open: number; total: number } | undefined,
  ) {
    return {
      ...toAnsweredQuestionView(row),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      reports: reports ?? { open: 0, total: 0 },
    };
  }
}
