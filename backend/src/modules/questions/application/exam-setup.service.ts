import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  ExamPatternError,
  parseExamPattern,
  patternTotals,
  readExamPattern,
  type ExamPattern,
} from '../domain/exam-pattern';
import { VISIBLE_QUESTION } from '../domain/question-view';
import type { Actor } from './subscription-management';

const SINGLETON_ID = 'global';
const SETTINGS_CACHE_KEY = 'pyq:practice-settings';
const MOCKS_CACHE_KEY = 'pyq:mock-offers';
/** Read at every session start and on the custom-test page; a change shows within this, or at once on this instance. */
const CACHE_TTL_SECONDS = 60;

export interface PracticeSettingsView {
  shuffleOptions: boolean;
}

/** A full mock a student can start: the exam's pattern, once the bank can fill it. */
export interface MockOffer {
  examId: string;
  name: string;
  shortName: string;
  totalQuestions: number;
  totalMinutes: number;
  pattern: ExamPattern;
}

export interface AdminExamSetup {
  examId: string;
  name: string;
  shortName: string;
  /** Published, undeleted questions of this exam — what a mock draws from. */
  publishedQuestions: number;
  enabled: boolean;
  /** Null until admin saves one. */
  pattern: ExamPattern | null;
  updatedAt: string | null;
}

/**
 * The admin's "Exam setup": the option-shuffle switch, and each exam's paper
 * pattern that full mocks follow. Reading is open to students (the mocks on
 * offer); every write is ADMIN-only at the controller and audited here, in
 * the same transaction as the change.
 */
@Injectable()
export class ExamSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  // --- Settings ---------------------------------------------------------------

  settings(): Promise<PracticeSettingsView> {
    return this.cache.wrap(SETTINGS_CACHE_KEY, CACHE_TTL_SECONDS, async () => settingsView(await this.settingsRow()));
  }

  async updateSettings(input: Partial<PracticeSettingsView>, actor: Actor): Promise<PracticeSettingsView> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await this.settingsRow(tx);
      const after = await tx.practiceSettings.update({
        where: { id: SINGLETON_ID },
        data: { ...(input.shuffleOptions !== undefined ? { shuffleOptions: input.shuffleOptions } : {}) },
      });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'pyq.practice_settings_updated',
          entityType: 'pyq_practice_settings',
          entityId: SINGLETON_ID,
          before: settingsView(before),
          after: settingsView(after),
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    await this.cache.del(SETTINGS_CACHE_KEY);
    return settingsView(row);
  }

  // --- Patterns ---------------------------------------------------------------

  async adminOverview(): Promise<{ settings: PracticeSettingsView; exams: AdminExamSetup[] }> {
    const [settings, exams, counts] = await Promise.all([
      this.settingsRow().then(settingsView),
      this.prisma.exam.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { pattern: true } }),
      this.publishedCounts(),
    ]);
    return {
      settings,
      exams: exams.map((exam) => adminView(exam, exam.pattern, counts.get(exam.id) ?? 0)),
    };
  }

  /** Creates or replaces an exam's pattern. Mocks already running keep the copy they started with. */
  async savePattern(
    examSlug: string,
    input: { enabled: boolean; pattern: unknown },
    actor: Actor,
  ): Promise<AdminExamSetup> {
    let pattern: ExamPattern;
    try {
      pattern = parseExamPattern(input.pattern);
    } catch (error) {
      if (error instanceof ExamPatternError) throw new BadRequestException(error.message);
      throw error;
    }
    const exam = await this.prisma.exam.findUnique({ where: { slug: examSlug } });
    if (!exam) throw new NotFoundException('Exam not found');

    const saved = await this.prisma.$transaction(async (tx) => {
      const before = await tx.examPattern.findUnique({ where: { examId: exam.id } });
      const data = { enabled: input.enabled, pattern: pattern as unknown as Prisma.InputJsonObject };
      const after = await tx.examPattern.upsert({
        where: { examId: exam.id },
        create: { examId: exam.id, ...data },
        update: data,
      });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'pyq.exam_pattern_saved',
          entityType: 'pyq_exam',
          entityId: exam.slug,
          before: before ? { enabled: before.enabled, pattern: before.pattern } : null,
          after: { enabled: after.enabled, pattern: after.pattern },
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    await this.cache.del(MOCKS_CACHE_KEY);
    const counts = await this.publishedCounts([exam.id]);
    return adminView(exam, saved, counts.get(exam.id) ?? 0);
  }

  /** Full mocks a student can start now: enabled patterns whose exam has enough published questions. */
  mockOffers(): Promise<MockOffer[]> {
    return this.cache.wrap(MOCKS_CACHE_KEY, CACHE_TTL_SECONDS, async () => {
      const [patterns, counts] = await Promise.all([
        this.prisma.examPattern.findMany({
          where: { enabled: true },
          include: { exam: true },
          orderBy: [{ exam: { sortOrder: 'asc' } }, { exam: { name: 'asc' } }],
        }),
        this.publishedCounts(),
      ]);
      return patterns.flatMap((row) => {
        const pattern = readExamPattern(row.pattern);
        if (!pattern) return [];
        const totals = patternTotals(pattern);
        if ((counts.get(row.examId) ?? 0) < totals.questions) return [];
        return [
          {
            examId: row.exam.slug,
            name: row.exam.name,
            shortName: row.exam.shortName,
            totalQuestions: totals.questions,
            totalMinutes: totals.minutes,
            pattern,
          },
        ];
      });
    });
  }

  /**
   * The pattern a new mock of this exam runs, read fresh (not cached): a
   * pattern admin just turned off must not start.
   */
  async patternForMock(examSlug: string): Promise<{ exam: { id: string; slug: string; shortName: string }; pattern: ExamPattern }> {
    const exam = await this.prisma.exam.findUnique({ where: { slug: examSlug }, include: { pattern: true } });
    if (!exam) throw new NotFoundException('Exam not found');
    const pattern = exam.pattern?.enabled ? readExamPattern(exam.pattern.pattern) : null;
    if (!pattern) {
      throw new ConflictException({ code: 'PYQ_MOCK_UNAVAILABLE', message: `A full ${exam.shortName} mock is not available.` });
    }
    return { exam: { id: exam.id, slug: exam.slug, shortName: exam.shortName }, pattern };
  }

  // --- internals ----------------------------------------------------------------

  private async publishedCounts(examIds?: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.question.groupBy({
      by: ['examId'],
      where: { ...VISIBLE_QUESTION, ...(examIds ? { examId: { in: examIds } } : {}) },
      _count: true,
    });
    return new Map(rows.map((row) => [row.examId, row._count]));
  }

  /** Upserts so a missing row heals instead of failing every session start. */
  private settingsRow(client: Pick<PrismaService, 'practiceSettings'> | Prisma.TransactionClient = this.prisma) {
    return client.practiceSettings.upsert({ where: { id: SINGLETON_ID }, create: { id: SINGLETON_ID }, update: {} });
  }
}

function settingsView(row: { shuffleOptions: boolean }): PracticeSettingsView {
  return { shuffleOptions: row.shuffleOptions };
}

function adminView(
  exam: { id: string; slug: string; name: string; shortName: string },
  row: { enabled: boolean; pattern: Prisma.JsonValue; updatedAt: Date } | null,
  publishedQuestions: number,
): AdminExamSetup {
  return {
    examId: exam.slug,
    name: exam.name,
    shortName: exam.shortName,
    publishedQuestions,
    enabled: row?.enabled ?? false,
    pattern: row ? readExamPattern(row.pattern) : null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}
