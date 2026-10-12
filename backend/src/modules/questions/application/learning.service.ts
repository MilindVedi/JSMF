import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  QUESTION_SUMMARY_SELECT,
  VISIBLE_QUESTION,
  toQuestionSummary,
  type QuestionSummaryRow,
} from '../domain/question-view';

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


/**
 * The learning loop built on a student's attempts: streaks, the revision and
 * reinforce lists, and PYQ preferences. Reads the derived per-question and
 * per-day tables (QuestionStateService keeps them in step with attempts), so
 * none of these scan a student's full answer history.
 */
@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // --- Streak -------------------------------------------------------------------

  async streak(userId: string, now: Date = new Date()) {
    // One row per active day: a few hundred rows a year, however many answers.
    const [rows, prefs] = await Promise.all([
      this.prisma.userDailyActivity.findMany({
        where: { userId, answered: { gt: 0 } },
        select: { day: true, answered: true },
      }),
      this.preferences(userId),
    ]);
    const days = rows.map((row) => ({ day: row.day.toISOString().slice(0, 10), answered: row.answered }));
    const today = istDay(now);
    const { current, longest, lastActiveDay } = computeStreak(
      days.map((row) => row.day),
      today,
    );
    const todayCount = days.find((row) => row.day === today)?.answered ?? 0;
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
   * Every question worth another look (attempted, bookmarked or collected),
   * with the facts the revision screen filters and sorts by. `due` marks the
   * spaced-revision set: latest answer wrong, flagged in any session, or
   * correct but not seen for REVISION_STALE_DAYS.
   */
  async revision(userId: string, now: Date = new Date()) {
    const [states, bookmarks, collected] = await Promise.all([
      this.prisma.userQuestionState.findMany({
        where: { userId, question: VISIBLE_QUESTION },
        select: {
          questionId: true,
          latestCorrect: true,
          lastAnsweredAt: true,
          lastCorrectAt: true,
          lastWrongAt: true,
          attemptCount: true,
          incorrectCount: true,
          flagged: true,
          question: { select: QUESTION_SUMMARY_SELECT },
        },
      }),
      this.prisma.bookmark.findMany({
        where: { userId, question: VISIBLE_QUESTION },
        select: { questionId: true, createdAt: true, question: { select: QUESTION_SUMMARY_SELECT } },
      }),
      this.prisma.collectionQuestion.groupBy({
        by: ['questionId'],
        where: { collection: { userId }, question: VISIBLE_QUESTION },
        _max: { addedAt: true },
      }),
    ]);

    const summaries = new Map<string, QuestionSummaryRow>();
    for (const row of [...states, ...bookmarks]) summaries.set(row.questionId, row.question);
    // Only questions that are collected and nothing else still need loading.
    const missing = collected.map((row) => row.questionId).filter((id) => !summaries.has(id));
    if (missing.length) {
      const rows = await this.prisma.question.findMany({
        where: { id: { in: missing } },
        select: QUESTION_SUMMARY_SELECT,
      });
      for (const row of rows) summaries.set(row.id, row);
    }

    const stateById = new Map(states.map((row) => [row.questionId, row]));
    const bookmarkedAt = new Map(bookmarks.map((row) => [row.questionId, row.createdAt]));
    const collectedAt = new Map(collected.map((row) => [row.questionId, row._max.addedAt]));
    const staleBefore = now.getTime() - REVISION_STALE_DAYS * DAY_MS;

    const items = [...summaries.entries()].map(([id, question]) => {
      const state = stateById.get(id);
      const latestCorrect = state?.latestCorrect ?? null;
      const lastAttemptedAt = state?.lastAnsweredAt ?? null;
      const flagged = state?.flagged ?? false;
      const due =
        latestCorrect === false ||
        flagged ||
        (latestCorrect === true && lastAttemptedAt !== null && lastAttemptedAt.getTime() < staleBefore);
      return {
        question: toQuestionSummary(question),
        latestCorrect,
        lastAttemptedAt,
        lastCorrectAt: state?.lastCorrectAt ?? null,
        lastWrongAt: state?.lastWrongAt ?? null,
        attemptCount: state?.attemptCount ?? 0,
        incorrectCount: state?.incorrectCount ?? 0,
        neverCorrected: Boolean(state && state.attemptCount > 0 && state.attemptCount === state.incorrectCount),
        flagged,
        bookmarkedAt: bookmarkedAt.get(id) ?? null,
        collectedAt: collectedAt.get(id) ?? null,
        due,
      };
    });
    return { staleDays: REVISION_STALE_DAYS, items };
  }

  /**
   * Questions whose latest answer was correct, split by whether that answer
   * was in the last `recentDays` India-time days.
   */
  async reinforce(userId: string, recentDays = DEFAULT_REINFORCE_RECENT_DAYS, now: Date = new Date()) {
    const rows = await this.prisma.userQuestionState.findMany({
      where: { userId, latestCorrect: true, question: VISIBLE_QUESTION },
      orderBy: { lastAnsweredAt: 'desc' },
      select: { lastAnsweredAt: true, question: { select: QUESTION_SUMMARY_SELECT } },
    });
    const since = addDays(istDay(now), -recentDays);
    const recent: string[] = [];
    const notRevisited: string[] = [];
    const all = rows.map((row) => {
      (istDay(row.lastAnsweredAt!) >= since ? recent : notRevisited).push(row.question.id);
      return { ...toQuestionSummary(row.question), lastCorrectAt: row.lastAnsweredAt };
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

}
