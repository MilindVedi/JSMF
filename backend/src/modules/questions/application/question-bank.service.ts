import { Injectable, NotFoundException } from '@nestjs/common';
import { Difficulty, Prisma, QuestionStatus } from '@prisma/client';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  QUESTION_SUMMARY_SELECT,
  QUESTION_VIEW_INCLUDE,
  VISIBLE_QUESTION,
  toAnsweredQuestionView,
  toQuestionSummary,
} from '../domain/question-view';
import { comparePapersNewestFirst, paperKey, parsePaperKey } from '../domain/exam-paper';

export type QuestionStatusFilter = 'unattempted' | 'correct' | 'incorrect' | 'bookmarked';

export interface QuestionFilters {
  examIds?: string[];
  subjectIds?: string[];
  topicIds?: string[];
  years?: number[];
  /**
   * Paper keys (`2026-06`, `2025`; see domain/exam-paper.ts), any of them.
   * Newer clients send these in place of `years`; `years` stays for older
   * app versions.
   */
  papers?: string[];
  difficulties?: Difficulty[];
  /** Per-user state; needs a userId. */
  status?: QuestionStatusFilter;
  /** In any of these collections of the user (union). Needs a userId. */
  collectionIds?: string[];
  /** Case-insensitive substring of the stem. */
  search?: string;
}

export const QUESTION_SORTS = ['newest-exam-year', 'oldest-exam-year', 'name-az', 'name-za'] as const;
export type QuestionSort = (typeof QUESTION_SORTS)[number];

/** Within a year: December's paper before June's, a question with no month last. */
const SESSION_DESC: Prisma.QuestionOrderByWithRelationInput = { sessionMonth: { sort: 'desc', nulls: 'last' } };
const SESSION_ASC: Prisma.QuestionOrderByWithRelationInput = { sessionMonth: { sort: 'asc', nulls: 'last' } };

/** `name-*` is the subject's name — the web app's label, not the stem. Ties break stably on externalKey. */
const ORDER_BY: Record<QuestionSort, Prisma.QuestionOrderByWithRelationInput[]> = {
  'newest-exam-year': [{ year: 'desc' }, SESSION_DESC, { externalKey: 'asc' }],
  'oldest-exam-year': [{ year: 'asc' }, SESSION_ASC, { externalKey: 'asc' }],
  'name-az': [{ subject: { name: 'asc' } }, { year: 'desc' }, SESSION_DESC, { externalKey: 'asc' }],
  'name-za': [{ subject: { name: 'desc' } }, { year: 'desc' }, SESSION_DESC, { externalKey: 'asc' }],
};

/** The per-user facts list screens show next to a question. */
export interface QuestionUserFacts {
  bookmarked: boolean;
  userStatus: 'unattempted' | 'correct' | 'incorrect';
}

export const TAXONOMY_CACHE_KEY = 'pyq:taxonomy';
/** Public and identical for everyone; admin writes drop it, so this is only a backstop. */
const TAXONOMY_TTL_SECONDS = 300;

/** Answered at least once (outside a running test): what "attempted" means everywhere. */
export const ANSWERED = { latestCorrect: { not: null } } as const;

/**
 * The question bank as students and admins read it. Taxonomy filters take
 * slugs, matching how the PYQ web app already addresses exams, subjects and
 * topics.
 *
 * Per-user state comes from `user_question_states` (see QuestionStateService),
 * so a filter or a page label is an indexed lookup whose cost does not grow
 * with how many questions the student has answered.
 */
@Injectable()
export class QuestionBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Exams, subjects, topics, years and papers, each with its count of published questions. */
  taxonomy() {
    return this.cache.wrap(TAXONOMY_CACHE_KEY, TAXONOMY_TTL_SECONDS, () => this.loadTaxonomy());
  }

  /** After any admin write that changes what students can see or how it is named. */
  invalidateTaxonomy(): Promise<void> {
    return this.cache.del(TAXONOMY_CACHE_KEY);
  }

  private async loadTaxonomy() {
    const [exams, subjects, topics, byExam, bySubject, byTopic, byPaper] = await Promise.all([
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
      this.prisma.question.groupBy({
        by: ['year', 'sessionMonth'],
        where: VISIBLE_QUESTION,
        _count: true,
      }),
    ]);

    const examCount = new Map(byExam.map((row) => [row.examId, row._count]));
    const subjectCount = new Map(bySubject.map((row) => [row.subjectId, row._count]));
    const topicCount = new Map(byTopic.map((row) => [row.topicId, row._count]));
    const papers = byPaper
      .map((row) => ({ year: row.year, month: row.sessionMonth, questionCount: row._count }))
      .sort(comparePapersNewestFirst);
    const yearCount = new Map<number, number>();
    for (const paper of papers) yearCount.set(paper.year, (yearCount.get(paper.year) ?? 0) + paper.questionCount);

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
      // Older app versions filter by year alone.
      years: [...yearCount].map(([year, questionCount]) => ({ year, questionCount })),
      papers: papers.map((paper) => ({ key: paperKey(paper.year, paper.month), ...paper })),
    };
  }

  /** Status and bookmark for exactly these questions, never the whole history. */
  async factsFor(userId: string, questionIds: string[]): Promise<Map<string, QuestionUserFacts>> {
    const [states, bookmarks] = await Promise.all([
      this.prisma.userQuestionState.findMany({
        where: { userId, questionId: { in: questionIds }, ...ANSWERED },
        select: { questionId: true, latestCorrect: true },
      }),
      this.prisma.bookmark.findMany({
        where: { userId, questionId: { in: questionIds } },
        select: { questionId: true },
      }),
    ]);
    const latest = new Map(states.map((row) => [row.questionId, row.latestCorrect]));
    const bookmarked = new Set(bookmarks.map((row) => row.questionId));
    return new Map(
      questionIds.map((id): [string, QuestionUserFacts] => {
        const correct = latest.get(id);
        return [
          id,
          {
            bookmarked: bookmarked.has(id),
            userStatus: correct == null ? 'unattempted' : correct ? 'correct' : 'incorrect',
          },
        ];
      }),
    );
  }

  /** Paginated, answer-free list for students. */
  async list(
    userId: string,
    filters: QuestionFilters,
    page: number,
    pageSize: number,
    sort: QuestionSort = 'newest-exam-year',
  ) {
    const where = this.whereFor(userId, filters);
    const [total, rows] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        select: QUESTION_SUMMARY_SELECT,
        orderBy: ORDER_BY[sort],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const facts = await this.factsFor(
      userId,
      rows.map((row) => row.id),
    );

    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({ ...toQuestionSummary(row), ...facts.get(row.id)! })),
    };
  }

  /** Ids of visible questions matching filters: what a new session draws from. */
  async matchingIds(userId: string, filters: QuestionFilters): Promise<string[]> {
    const rows = await this.prisma.question.findMany({
      where: this.whereFor(userId, filters),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Every filter is a join or subquery on an index; no id lists are built in memory. */
  whereFor(userId: string, filters: QuestionFilters): Prisma.QuestionWhereInput {
    const and: Prisma.QuestionWhereInput[] = [VISIBLE_QUESTION];
    if (filters.examIds?.length) and.push({ exam: { slug: { in: filters.examIds } } });
    if (filters.subjectIds?.length) and.push({ subject: { slug: { in: filters.subjectIds } } });
    if (filters.topicIds?.length) and.push({ topic: { slug: { in: filters.topicIds } } });
    if (filters.years?.length) and.push({ year: { in: filters.years } });
    if (filters.papers?.length) {
      const papers = filters.papers.flatMap((key) => parsePaperKey(key) ?? []);
      and.push({ OR: papers.map((paper) => ({ year: paper.year, sessionMonth: paper.month })) });
    }
    if (filters.difficulties?.length) and.push({ difficulty: { in: filters.difficulties } });
    const search = filters.search?.trim();
    if (search) and.push({ stem: { contains: search, mode: 'insensitive' } });
    if (filters.collectionIds?.length) {
      and.push({
        collectionItems: {
          some: { collectionId: { in: filters.collectionIds }, collection: { userId } },
        },
      });
    }

    if (filters.status === 'bookmarked') {
      and.push({ bookmarks: { some: { userId } } });
    } else if (filters.status === 'unattempted') {
      and.push({ userStates: { none: { userId, ...ANSWERED } } });
    } else if (filters.status) {
      and.push({ userStates: { some: { userId, latestCorrect: filters.status === 'correct' } } });
    }
    return { AND: and };
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
