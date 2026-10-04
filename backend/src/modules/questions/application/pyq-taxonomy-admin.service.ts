import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { activity } from "../../../shared/logging/activity";
import { PrismaService } from "../../../shared/prisma/prisma.service";

const ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

/**
 * Exams, subjects and topics as admins manage them. Slugs are permanent —
 * they are the ids the web app, filters and imports use — so "rename" changes
 * only the display name. Deleting is allowed only for an entry nothing points
 * at (not even a soft-deleted question); everything else is rename/reorder.
 */
@Injectable()
export class PyqTaxonomyAdminService {
  private readonly logger = new Logger(PyqTaxonomyAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Everything, with counts of live (undeleted) questions of any status. */
  async tree() {
    const live = { deletedAt: null };
    const [exams, subjects, topics, byExam, bySubject, byTopic] =
      await Promise.all([
        this.prisma.exam.findMany({ orderBy: ORDER }),
        this.prisma.subject.findMany({ orderBy: ORDER }),
        this.prisma.topic.findMany({
          orderBy: ORDER,
          include: { subject: { select: { slug: true } } },
        }),
        this.prisma.question.groupBy({
          by: ["examId"],
          where: live,
          _count: true,
        }),
        this.prisma.question.groupBy({
          by: ["subjectId"],
          where: live,
          _count: true,
        }),
        this.prisma.question.groupBy({
          by: ["topicId"],
          where: live,
          _count: true,
        }),
      ]);
    const examCount = new Map(byExam.map((row) => [row.examId, row._count]));
    const subjectCount = new Map(
      bySubject.map((row) => [row.subjectId, row._count]),
    );
    const topicCount = new Map(byTopic.map((row) => [row.topicId, row._count]));

    return {
      exams: exams.map((exam) => ({
        id: exam.slug,
        name: exam.name,
        shortName: exam.shortName,
        description: exam.description,
        sortOrder: exam.sortOrder,
        questionCount: examCount.get(exam.id) ?? 0,
      })),
      subjects: subjects.map((subject) => ({
        id: subject.slug,
        name: subject.name,
        group: subject.group,
        description: subject.description,
        sortOrder: subject.sortOrder,
        questionCount: subjectCount.get(subject.id) ?? 0,
      })),
      topics: topics.map((topic) => ({
        id: topic.slug,
        subjectId: topic.subject.slug,
        name: topic.name,
        sortOrder: topic.sortOrder,
        questionCount: topicCount.get(topic.id) ?? 0,
      })),
    };
  }

  async createExam(
    input: {
      slug: string;
      name: string;
      shortName?: string;
      description?: string;
    },
    actorId: string,
  ) {
    const sortOrder = await this.nextOrder(
      this.prisma.exam.aggregate({ _max: { sortOrder: true } }),
    );
    const row = await this.unique(() =>
      this.prisma.exam.create({
        data: {
          slug: input.slug,
          name: input.name,
          shortName: input.shortName || input.name,
          description: input.description || null,
          sortOrder,
        },
      }),
    );
    activity(this.logger, "pyq.exam_created", { actorId, slug: row.slug });
    return row;
  }

  async updateExam(
    slug: string,
    input: { name?: string; shortName?: string; description?: string },
    actorId: string,
  ) {
    await this.found(this.prisma.exam.findUnique({ where: { slug } }), "Exam");
    const row = await this.prisma.exam.update({
      where: { slug },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.shortName !== undefined
          ? { shortName: input.shortName }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description || null }
          : {}),
      },
    });
    activity(this.logger, "pyq.exam_updated", { actorId, slug });
    return row;
  }

  async deleteExam(slug: string, actorId: string) {
    const exam = await this.found(
      this.prisma.exam.findUnique({ where: { slug } }),
      "Exam",
    );
    const used = await this.prisma.question.count({
      where: { examId: exam.id },
    });
    if (used)
      throw new ConflictException(
        `${exam.name} is used by ${used} question(s)`,
      );
    await this.prisma.exam.delete({ where: { id: exam.id } });
    activity(this.logger, "pyq.exam_deleted", { actorId, slug });
  }

  async createSubject(
    input: { slug: string; name: string; group: string; description?: string },
    actorId: string,
  ) {
    const sortOrder = await this.nextOrder(
      this.prisma.subject.aggregate({ _max: { sortOrder: true } }),
    );
    const row = await this.unique(() =>
      this.prisma.subject.create({
        data: {
          slug: input.slug,
          name: input.name,
          group: input.group,
          description: input.description || null,
          sortOrder,
        },
      }),
    );
    activity(this.logger, "pyq.subject_created", { actorId, slug: row.slug });
    return row;
  }

  async updateSubject(
    slug: string,
    input: { name?: string; group?: string; description?: string },
    actorId: string,
  ) {
    await this.found(
      this.prisma.subject.findUnique({ where: { slug } }),
      "Subject",
    );
    const row = await this.prisma.subject.update({
      where: { slug },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.group !== undefined ? { group: input.group } : {}),
        ...(input.description !== undefined
          ? { description: input.description || null }
          : {}),
      },
    });
    activity(this.logger, "pyq.subject_updated", { actorId, slug });
    return row;
  }

  async deleteSubject(slug: string, actorId: string) {
    const subject = await this.found(
      this.prisma.subject.findUnique({ where: { slug } }),
      "Subject",
    );
    const [questions, topics] = await Promise.all([
      this.prisma.question.count({ where: { subjectId: subject.id } }),
      this.prisma.topic.count({ where: { subjectId: subject.id } }),
    ]);
    if (questions || topics) {
      throw new ConflictException(
        `${subject.name} still has ${questions} question(s) and ${topics} topic(s)`,
      );
    }
    await this.prisma.subject.delete({ where: { id: subject.id } });
    activity(this.logger, "pyq.subject_deleted", { actorId, slug });
  }

  async createTopic(
    input: { slug: string; subjectId: string; name: string },
    actorId: string,
  ) {
    const subject = await this.prisma.subject.findUnique({
      where: { slug: input.subjectId },
    });
    if (!subject)
      throw new BadRequestException(`Unknown subject ${input.subjectId}`);
    const sortOrder = await this.nextOrder(
      this.prisma.topic.aggregate({
        where: { subjectId: subject.id },
        _max: { sortOrder: true },
      }),
    );
    const row = await this.unique(() =>
      this.prisma.topic.create({
        data: {
          slug: input.slug,
          subjectId: subject.id,
          name: input.name,
          sortOrder,
        },
      }),
    );
    activity(this.logger, "pyq.topic_created", { actorId, slug: row.slug });
    return row;
  }

  async updateTopic(slug: string, input: { name: string }, actorId: string) {
    await this.found(
      this.prisma.topic.findUnique({ where: { slug } }),
      "Topic",
    );
    const row = await this.prisma.topic.update({
      where: { slug },
      data: { name: input.name },
    });
    activity(this.logger, "pyq.topic_updated", { actorId, slug });
    return row;
  }

  async deleteTopic(slug: string, actorId: string) {
    const topic = await this.found(
      this.prisma.topic.findUnique({ where: { slug } }),
      "Topic",
    );
    const used = await this.prisma.question.count({
      where: { topicId: topic.id },
    });
    if (used)
      throw new ConflictException(
        `${topic.name} is used by ${used} question(s)`,
      );
    await this.prisma.topic.delete({ where: { id: topic.id } });
    activity(this.logger, "pyq.topic_deleted", { actorId, slug });
  }

  /** Sets sortOrder to the position in `slugs`. Topics must share one subject. */
  async reorder(
    kind: "exams" | "subjects" | "topics",
    slugs: string[],
    actorId: string,
  ) {
    if (new Set(slugs).size !== slugs.length) {
      throw new BadRequestException("A slug appears twice");
    }
    const delegate = {
      exams: this.prisma.exam,
      subjects: this.prisma.subject,
      topics: this.prisma.topic,
    }[kind] as unknown as {
      findMany(args: unknown): Promise<{ slug: string; subjectId?: string }[]>;
    };
    const rows = await delegate.findMany({ where: { slug: { in: slugs } } });
    if (rows.length !== slugs.length) {
      const known = new Set(rows.map((row) => row.slug));
      throw new BadRequestException(
        `Unknown: ${slugs.filter((slug) => !known.has(slug)).join(", ")}`,
      );
    }
    if (
      kind === "topics" &&
      new Set(rows.map((row) => row.subjectId)).size > 1
    ) {
      throw new BadRequestException("Reorder topics one subject at a time");
    }
    await this.prisma.$transaction(
      slugs.map((slug, index) => {
        const args = { where: { slug }, data: { sortOrder: index } };
        if (kind === "exams") return this.prisma.exam.update(args);
        if (kind === "subjects") return this.prisma.subject.update(args);
        return this.prisma.topic.update(args);
      }),
    );
    activity(this.logger, "pyq.taxonomy_reordered", {
      actorId,
      kind,
      count: slugs.length,
    });
    return this.tree();
  }

  private async nextOrder(
    aggregate: Promise<{ _max: { sortOrder: number | null } }>,
  ): Promise<number> {
    const result = await aggregate;
    return (result._max.sortOrder ?? -1) + 1;
  }

  private async found<T>(lookup: Promise<T | null>, what: string): Promise<T> {
    const row = await lookup;
    if (!row) throw new NotFoundException(`${what} not found`);
    return row;
  }

  private async unique<T>(create: () => Promise<T>): Promise<T> {
    try {
      return await create();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("That slug is already used");
      }
      throw error;
    }
  }
}
