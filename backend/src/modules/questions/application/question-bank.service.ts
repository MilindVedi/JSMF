import { Injectable, NotFoundException } from '@nestjs/common';
import { Difficulty, Prisma, QuestionStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  QUESTION_VIEW_INCLUDE,
  VISIBLE_QUESTION,
  toAnsweredQuestionView,
  toQuestionView,
} from '../domain/question-view';

export type UserQuestionState = 'unattempted' | 'correct' | 'incorrect' | 'bookmarked';

export interface QuestionFilters {
  examIds?: string[];
  subjectIds?: string[];
  topicIds?: string[];
  years?: number[];
  difficulties?: Difficulty[];
  /** Per-user state; needs a userId. */
  status?: UserQuestionState;
  /** In any of these collections of the user (union). Needs a userId. */
  collectionIds?: string[];
}

export interface LatestAttempt {
  questionId: string;
  isCorrect: boolean;
  answeredAt: Date;
}

/**
 * The question bank as students and admins read it. Taxonomy filters take
 * slugs, matching how the PYQ web app already addresses exams, subjects and
 * topics.
 */
@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  /** Exams, subjects and topics, each with its count of published questions. */
  async taxonomy() {
    const [exams, subjects, topics, byExam, bySubject, byTopic] = await Promise.all([
      this.prisma.exam.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.subject.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.topic.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { subject: { select: { slug: true } } },
      }),
      this.prisma.question.groupBy({
        by: ['examId'],
        where: VISIBLE_QUESTION,
        _count: true,
      }),
      this.prisma.question.groupBy({
        by: ['subjectId'],
        where: VISIBLE_QUESTION,
        _count: true,
      }),
      this.prisma.question.groupBy({
        by: ['topicId'],
        where: VISIBLE_QUESTION,
        _count: true,
      }),
    ]);

    const examCount = new Map(byExam.map((row) => [row.examId, row._count]));
    const subjectCount = new Map(bySubject.map((row) => [row.subjectId, row._count]));
    const topicCount = new Map(byTopic.map((row) => [row.topicId, row._count]));

    return {
      exams: exams.map((exam) => ({
        id: exam.slug,
        name: exam.name,
        shortName: exam.shortName,
        description: exam.description,
        questionCount: examCount.get(exam.id) ?? 0,
      })),
      subjects: subjects.map((subject) => ({
        id: subject.slug,
        slug: subject.slug,
        name: subject.name,
        group: subject.group,
        description: subject.description,
        questionCount: subjectCount.get(subject.id) ?? 0,
      })),
      topics: topics.map((topic) => ({
        id: topic.slug,
        subjectId: topic.subject.slug,
        name: topic.name,
        questionCount: topicCount.get(topic.id) ?? 0,
      })),
    };
  }

  /** Paginated, answer-free list for students. */
  async list(userId: string, filters: QuestionFilters, page: number, pageSize: number) {
    const where = await this.whereFor(userId, filters);
    const [total, rows, latest, bookmarks] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        include: QUESTION_VIEW_INCLUDE,
        orderBy: [{ year: 'desc' }, { externalKey: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.latestAttempts(userId),
      this.prisma.bookmark.findMany({
        where: { userId },
        select: { questionId: true },
      }),
    ]);
    const bookmarked = new Set(bookmarks.map((row) => row.questionId));

    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => {
        const last = latest.get(row.id);
        return {
          ...toQuestionView(row),
          bookmarked: bookmarked.has(row.id),
          userStatus: !last ? 'unattempted' : last.isCorrect ? 'correct' : 'incorrect',
        };
      }),
    };
  }

  /** Ids of visible questions matching filters — what a new session draws from. */
  async matchingIds(userId: string, filters: QuestionFilters): Promise<string[]> {
    const rows = await this.prisma.question.findMany({
      where: await this.whereFor(userId, filters),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async whereFor(userId: string, filters: QuestionFilters): Promise<Prisma.QuestionWhereInput> {
    const and: Prisma.QuestionWhereInput[] = [VISIBLE_QUESTION];
    if (filters.examIds?.length) and.push({ exam: { slug: { in: filters.examIds } } });
    if (filters.subjectIds?.length) and.push({ subject: { slug: { in: filters.subjectIds } } });
    if (filters.topicIds?.length) and.push({ topic: { slug: { in: filters.topicIds } } });
    if (filters.years?.length) and.push({ year: { in: filters.years } });
    if (filters.difficulties?.length) and.push({ difficulty: { in: filters.difficulties } });
    if (filters.collectionIds?.length) {
      and.push({
        collectionItems: {
          some: { collectionId: { in: filters.collectionIds }, collection: { userId } },
        },
      });
    }

    if (filters.status === 'bookmarked') {
      and.push({ bookmarks: { some: { userId } } });
    } else if (filters.status) {
      const latest = await this.latestAttempts(userId);
      const attempted = [...latest.keys()];
      if (filters.status === 'unattempted') {
        and.push({ id: { notIn: attempted } });
      } else {
        const wantCorrect = filters.status === 'correct';
        and.push({
          id: {
            in: attempted.filter((id) => latest.get(id)!.isCorrect === wantCorrect),
          },
        });
      }
    }
    return { AND: and };
  }

  /**
   * Each question's most recent answer by this user — the web app's
   * definition of "correct" / "wrong". Answers inside a TEST that has not
   * been submitted are excluded: counting them would reveal correctness
   * through the wrong-questions list before the test is over.
   */
  async latestAttempts(userId: string): Promise<Map<string, LatestAttempt>> {
    const rows = await this.prisma.$queryRaw<LatestAttempt[]>`
      SELECT DISTINCT ON (a.question_id)
        a.question_id AS "questionId", a.is_correct AS "isCorrect", a.answered_at AS "answeredAt"
      FROM pyq.attempts a
      JOIN pyq.practice_sessions s ON s.id = a.session_id
      WHERE a.user_id = ${userId}::uuid
        AND a.answered_at IS NOT NULL
        AND NOT (s.mode = 'TEST' AND s.status = 'IN_PROGRESS')
      ORDER BY a.question_id, a.answered_at DESC`;
    return new Map(rows.map((row) => [row.questionId, row]));
  }

  async viewsByIds(ids: string[]) {
    const rows = await this.prisma.question.findMany({
      where: { id: { in: ids } },
      include: QUESTION_VIEW_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  // --- Admin ----------------------------------------------------------------

  async setStatus(id: string, status: QuestionStatus) {
    const existing = await this.prisma.question.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Question not found');
    const row = await this.prisma.question.update({
      where: { id },
      data: { status },
      include: QUESTION_VIEW_INCLUDE,
    });
    return { ...toAnsweredQuestionView(row), status: row.status };
  }
}
