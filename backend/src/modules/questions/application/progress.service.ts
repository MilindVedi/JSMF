import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QuestionReportReason } from '@prisma/client';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  QUESTION_SUMMARY_SELECT,
  VISIBLE_QUESTION,
  startOfIndiaDay,
  toQuestionSummary,
} from '../domain/question-view';
import { ANSWERED, QuestionBankService } from './question-bank.service';

const DAY_MS = 86_400_000;
/** How far back the accuracy chart draws. */
export const TREND_DAYS = 90;

/**
 * Everything derived from a student's history: bookmarks, the wrong-questions
 * revision set, statistics, and reports about questions. Statistics are
 * computed, never stored, so they cannot drift from the attempts they describe.
 */
@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bank: QuestionBankService,
  ) {}

  /** Newest first; questions since unpublished or deleted drop out. */
  async listBookmarks(userId: string) {
    const bookmarks = await this.prisma.bookmark.findMany({
      where: { userId, question: VISIBLE_QUESTION },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        questionId: true,
        createdAt: true,
        question: { select: QUESTION_SUMMARY_SELECT },
      },
    });
    const facts = await this.bank.factsFor(
      userId,
      bookmarks.map((row) => row.questionId),
    );
    return bookmarks.map((bookmark) => ({
      id: bookmark.id,
      questionId: bookmark.questionId,
      createdAt: bookmark.createdAt,
      question: toQuestionSummary(bookmark.question),
      userStatus: facts.get(bookmark.questionId)!.userStatus,
    }));
  }

  /** Just the ids: what every screen needs to draw a bookmark icon. */
  async bookmarkIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.bookmark.findMany({
      where: { userId, question: VISIBLE_QUESTION },
      select: { questionId: true },
    });
    return rows.map((row) => row.questionId);
  }

  async addBookmark(userId: string, questionId: string) {
    await this.assertVisible(questionId);
    const bookmark = await this.prisma.bookmark.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: { userId, questionId },
      update: {},
    });
    return { id: bookmark.id, questionId, createdAt: bookmark.createdAt };
  }

  async removeBookmark(userId: string, questionId: string): Promise<void> {
    await this.prisma.bookmark.deleteMany({ where: { userId, questionId } });
  }

  /** Questions whose most recent answer was wrong, most recent first. */
  async wrongQuestions(userId: string) {
    const rows = await this.prisma.userQuestionState.findMany({
      where: { userId, latestCorrect: false, question: VISIBLE_QUESTION },
      orderBy: { lastAnsweredAt: 'desc' },
      select: { lastAnsweredAt: true, question: { select: QUESTION_SUMMARY_SELECT } },
    });
    return rows.map((row) => ({ ...toQuestionSummary(row.question), lastAnsweredAt: row.lastAnsweredAt }));
  }

  /**
   * Totals from the per-question state (one row per question, so a question
   * moves between buckets rather than being counted twice), and the accuracy
   * trend over the last TREND_DAYS. The trend's running accuracy still covers
   * every answer ever given: it starts from the all-time totals, less the
   * window, so limiting the window only limits what is drawn.
   */
  async stats(userId: string, now: Date = new Date()) {
    const since = new Date(startOfIndiaDay(now).getTime() - (TREND_DAYS - 1) * DAY_MS);
    const [taxonomy, buckets, totals, bySubject, bookmarkCount, trendRows] = await Promise.all([
      this.bank.taxonomy(),
      this.prisma.userQuestionState.groupBy({
        by: ['latestCorrect'],
        where: { userId, ...ANSWERED },
        _count: true,
      }),
      this.prisma.userQuestionState.aggregate({
        where: { userId },
        _sum: { attemptCount: true, incorrectCount: true },
      }),
      this.prisma.$queryRaw<{ subjectId: string; attempted: number; correct: number }[]>`
        SELECT sub.slug AS "subjectId",
               count(*)::int AS attempted,
               count(*) FILTER (WHERE st.latest_correct)::int AS correct
        FROM pyq.user_question_states st
        JOIN pyq.questions q ON q.id = st.question_id
        JOIN pyq.subjects sub ON sub.id = q.subject_id
        WHERE st.user_id = ${userId}::uuid AND st.latest_correct IS NOT NULL
        GROUP BY sub.slug`,
      this.prisma.bookmark.count({ where: { userId, question: VISIBLE_QUESTION } }),
      // Per India-time day: that day's accuracy over answers given that day.
      this.prisma.$queryRaw<{ day: string; answered: number; correct: number }[]>`
        SELECT to_char(a.answered_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               count(*)::int AS answered,
               count(*) FILTER (WHERE a.is_correct)::int AS correct
        FROM pyq.attempts a
        JOIN pyq.practice_sessions s ON s.id = a.session_id
        WHERE a.user_id = ${userId}::uuid
          AND a.answered_at >= ${since}
          AND NOT (s.mode = 'TEST' AND s.status = 'IN_PROGRESS')
        GROUP BY 1
        ORDER BY 1`,
    ]);

    const totalQuestions = taxonomy.exams.reduce((sum, exam) => sum + exam.questionCount, 0);
    const correct = buckets.find((row) => row.latestCorrect === true)?._count ?? 0;
    const attempted = correct + (buckets.find((row) => row.latestCorrect === false)?._count ?? 0);
    const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

    const allAnswered = totals._sum.attemptCount ?? 0;
    const allCorrect = allAnswered - (totals._sum.incorrectCount ?? 0);
    let runningAnswered = allAnswered - trendRows.reduce((sum, row) => sum + row.answered, 0);
    let runningCorrect = allCorrect - trendRows.reduce((sum, row) => sum + row.correct, 0);
    const accuracyTrend = trendRows.map((row) => {
      runningAnswered += row.answered;
      runningCorrect += row.correct;
      return {
        date: row.day,
        answered: row.answered,
        accuracy: percent(row.correct, row.answered),
        cumulativeAccuracy: percent(runningCorrect, runningAnswered),
      };
    });

    return {
      totalQuestions,
      attempted,
      correct,
      incorrect: attempted - correct,
      unattempted: Math.max(0, totalQuestions - attempted),
      accuracy: percent(correct, attempted),
      coverage: percent(attempted, totalQuestions),
      bySubject: bySubject.map((entry) => ({
        subjectId: entry.subjectId,
        attempted: entry.attempted,
        correct: entry.correct,
        incorrect: entry.attempted - entry.correct,
        accuracy: percent(entry.correct, entry.attempted),
      })),
      accuracyTrend,
      wrongQuestionCount: attempted - correct,
      bookmarkCount,
    };
  }

  async report(
    userId: string,
    questionId: string,
    input: { reason: QuestionReportReason; details?: string },
  ) {
    await this.assertVisible(questionId);
    const report = await this.prisma.questionReport.create({
      data: {
        userId,
        questionId,
        reason: input.reason,
        details: input.details?.trim() || null,
      },
    });
    activity(this.logger, 'questions.reported', {
      userId,
      questionId,
      reportId: report.id,
      reason: report.reason,
    });
    return {
      id: report.id,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  private async assertVisible(questionId: string): Promise<void> {
    const found = await this.prisma.question.findFirst({
      where: { ...VISIBLE_QUESTION, id: questionId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Question not found');
  }
}
