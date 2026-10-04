import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { toQuestionView } from '../domain/question-view';
import { QuestionBankService } from './question-bank.service';

/** India is UTC+5:30 with no DST, so a fixed offset is exact. */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
export const DEFAULT_DAILY_TARGET = 10;
/** A correct answer older than this is "due" again on the revision list. */
export const REVISION_STALE_DAYS = 30;
export const DEFAULT_REINFORCE_RECENT_DAYS = 7;

/** `YYYY-MM-DD` of an instant in India time. */
export function istDay(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Current and longest run of consecutive active days. A streak survives until
 * the end of the day after its last active day: with nothing yet today, a run
 * ending yesterday is still "current".
 */
export function computeStreak(activeDays: string[], today: string) {
  const days = [...new Set(activeDays)].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of days) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const set = new Set(days);
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, lastActiveDay: previous };
}

interface AttemptAggregate {
  questionId: string;
  attemptCount: number;
  incorrectCount: number;
  everCorrect: boolean;
  lastAttemptedAt: Date | null;
  lastCorrectAt: Date | null;
  lastWrongAt: Date | null;
  flagged: boolean;
}

/**
 * The learning loop built on a student's attempts: streaks, the revision and
 * reinforce lists, and PYQ preferences. Everything here except preferences is
 * computed from attempts, bookmarks and collections on read — nothing to keep
 * in step, nothing to drift.
 */
@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bank: QuestionBankService,
  ) {}

  // --- Streak -------------------------------------------------------------------

  async streak(userId: string, now: Date = new Date()) {
    const [rows, prefs] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; answered: number }[]>`
        SELECT to_char(answered_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               count(*)::int AS answered
        FROM pyq.attempts
        WHERE user_id = ${userId}::uuid AND answered_at IS NOT NULL
        GROUP BY 1`,
      this.preferences(userId),
    ]);
    const today = istDay(now);
    const { current, longest, lastActiveDay } = computeStreak(
      rows.map((row) => row.day),
      today,
    );
    const todayCount = rows.find((row) => row.day === today)?.answered ?? 0;
    return {
      currentStreak: current,
      longestStreak: longest,
      today,
      todayCount,
      dailyTarget: prefs.dailyTarget,
      todayDone: todayCount >= prefs.dailyTarget,
      lastActiveDay,
    };
  }

  // --- Revision / reinforce -----------------------------------------------------

  /**
   * Every question worth another look — attempted, bookmarked or collected —
   * with the facts the revision screen filters and sorts by. `due` marks the
   * spaced-revision set: latest answer wrong, flagged in any session, or
   * correct but not seen for REVISION_STALE_DAYS.
   */
  async revision(userId: string, now: Date = new Date()) {
    const [aggregates, latest, bookmarks, collected] = await Promise.all([
      this.aggregates(userId),
      this.bank.latestAttempts(userId),
      this.prisma.bookmark.findMany({ where: { userId }, select: { questionId: true, createdAt: true } }),
      this.prisma.collectionQuestion.groupBy({
        by: ['questionId'],
        where: { collection: { userId } },
        _max: { addedAt: true },
      }),
    ]);
    const byQuestion = new Map(aggregates.map((row) => [row.questionId, row]));
    const bookmarkedAt = new Map(bookmarks.map((row) => [row.questionId, row.createdAt]));
    const collectedAt = new Map(collected.map((row) => [row.questionId, row._max.addedAt]));
    const ids = [...new Set([...byQuestion.keys(), ...bookmarkedAt.keys(), ...collectedAt.keys()])];
    const staleBefore = now.getTime() - REVISION_STALE_DAYS * DAY_MS;

    const questions = await this.bank.viewsByIds(ids);
    const items = questions
      .filter((question) => question.status === 'PUBLISHED' && !question.deletedAt)
      .map((question) => {
        const agg = byQuestion.get(question.id);
        const last = latest.get(question.id);
        const latestCorrect = last ? last.isCorrect : null;
        const lastAttemptedAt = last?.answeredAt ?? null;
        const flagged = agg?.flagged ?? false;
        const due =
          latestCorrect === false ||
          flagged ||
          (latestCorrect === true && lastAttemptedAt !== null && lastAttemptedAt.getTime() < staleBefore);
        return {
          question: toQuestionView(question),
          latestCorrect,
          lastAttemptedAt,
          lastCorrectAt: agg?.lastCorrectAt ?? null,
          lastWrongAt: agg?.lastWrongAt ?? null,
          attemptCount: agg?.attemptCount ?? 0,
          incorrectCount: agg?.incorrectCount ?? 0,
          neverCorrected: Boolean(agg && agg.attemptCount > 0 && !agg.everCorrect),
          flagged,
          bookmarkedAt: bookmarkedAt.get(question.id) ?? null,
          collectedAt: collectedAt.get(question.id) ?? null,
          due,
        };
      });
    return { staleDays: REVISION_STALE_DAYS, items };
  }

  /**
   * Questions whose latest answer was correct, split by whether that answer
   * was in the last `recentDays` India-time days — the mock's reinforce facets.
   */
  async reinforce(userId: string, recentDays = DEFAULT_REINFORCE_RECENT_DAYS, now: Date = new Date()) {
    const latest = await this.bank.latestAttempts(userId);
    const correct = [...latest.values()]
      .filter((attempt) => attempt.isCorrect)
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime());
    const since = addDays(istDay(now), -recentDays);
    const questions = await this.bank.viewsByIds(correct.map((attempt) => attempt.questionId));
    const byId = new Map(questions.map((row) => [row.id, row]));
    const recent: string[] = [];
    const notRevisited: string[] = [];
    const all = correct.flatMap((attempt) => {
      const question = byId.get(attempt.questionId);
      if (!question || question.status !== 'PUBLISHED' || question.deletedAt) return [];
      (istDay(attempt.answeredAt) >= since ? recent : notRevisited).push(question.id);
      return [{ ...toQuestionView(question), lastCorrectAt: attempt.answeredAt }];
    });
    return { recentDays, all, recentIds: recent, notRevisitedIds: notRevisited };
  }

  // --- Preferences ----------------------------------------------------------------

  async preferences(userId: string) {
    const row = await this.prisma.pyqPreference.findUnique({ where: { userId } });
    return {
      targetExamId: row?.targetExam ?? null,
      dailyTarget: row?.dailyTarget ?? DEFAULT_DAILY_TARGET,
    };
  }

  async updatePreferences(userId: string, input: { targetExamId?: string | null; dailyTarget?: number }) {
    if (input.targetExamId) {
      const exam = await this.prisma.exam.findUnique({ where: { slug: input.targetExamId }, select: { id: true } });
      if (!exam) throw new BadRequestException('Unknown exam');
    }
    const data = {
      ...(input.targetExamId !== undefined ? { targetExam: input.targetExamId } : {}),
      ...(input.dailyTarget !== undefined ? { dailyTarget: input.dailyTarget } : {}),
    };
    await this.prisma.pyqPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    activity(this.logger, 'pyq.preferences_updated', {
      userId,
      targetExamId: input.targetExamId,
      dailyTarget: input.dailyTarget,
    });
    return this.preferences(userId);
  }

  /** Per-question attempt facts. Unsubmitted TEST answers stay hidden. */
  private aggregates(userId: string) {
    return this.prisma.$queryRaw<AttemptAggregate[]>`
      SELECT a.question_id AS "questionId",
             count(a.answered_at)::int AS "attemptCount",
             count(*) FILTER (WHERE a.answered_at IS NOT NULL AND NOT a.is_correct)::int AS "incorrectCount",
             coalesce(bool_or(a.is_correct) FILTER (WHERE a.answered_at IS NOT NULL), false) AS "everCorrect",
             max(a.answered_at) AS "lastAttemptedAt",
             max(a.answered_at) FILTER (WHERE a.is_correct) AS "lastCorrectAt",
             max(a.answered_at) FILTER (WHERE NOT a.is_correct) AS "lastWrongAt",
             bool_or(a.flagged) AS "flagged"
      FROM pyq.attempts a
      JOIN pyq.practice_sessions s ON s.id = a.session_id
      WHERE a.user_id = ${userId}::uuid
        AND NOT (s.mode = 'TEST' AND s.status = 'IN_PROGRESS')
      GROUP BY a.question_id`;
  }
}
