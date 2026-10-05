import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QuestionReportReason } from '@prisma/client';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { VISIBLE_QUESTION, toQuestionView } from '../domain/question-view';
import { QuestionBankService } from './question-bank.service';

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

  async listBookmarks(userId: string) {
    const bookmarks = await this.prisma.bookmark.findMany({
      where: { userId, question: VISIBLE_QUESTION },
      orderBy: { createdAt: 'desc' },
    });
    const questions = await this.bank.viewsByIds(bookmarks.map((row) => row.questionId));
    const byId = new Map(questions.map((row) => [row.id, row]));
    return bookmarks.flatMap((bookmark) => {
      const question = byId.get(bookmark.questionId);
      return question
        ? [
            {
              id: bookmark.id,
              questionId: bookmark.questionId,
              createdAt: bookmark.createdAt,
              question: toQuestionView(question),
            },
          ]
        : [];
    });
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

  /** Questions whose most recent answer was wrong — the revision set. */
  async wrongQuestions(userId: string) {
    const latest = await this.bank.latestAttempts(userId);
    const wrong = [...latest.values()]
      .filter((attempt) => !attempt.isCorrect)
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime());
    const questions = await this.bank.viewsByIds(wrong.map((attempt) => attempt.questionId));
    const byId = new Map(questions.map((row) => [row.id, row]));
    return wrong.flatMap((attempt) => {
      const question = byId.get(attempt.questionId);
      if (!question || question.status !== 'PUBLISHED' || question.deletedAt) return [];
      return [{ ...toQuestionView(question), lastAnsweredAt: attempt.answeredAt }];
    });
  }

  async stats(userId: string) {
    const [latest, totalQuestions, bookmarkCount, subjects, trendRows] = await Promise.all([
      this.bank.latestAttempts(userId),
      this.prisma.question.count({ where: VISIBLE_QUESTION }),
      this.prisma.bookmark.count({ where: { userId } }),
      this.prisma.subject.findMany({ select: { id: true, slug: true } }),
      // Per India-time day: that day's accuracy over answers given that day.
      this.prisma.$queryRaw<{ day: string; answered: number; correct: number }[]>`
        SELECT to_char(a.answered_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               count(*)::int AS answered,
               count(*) FILTER (WHERE a.is_correct)::int AS correct
        FROM pyq.attempts a
        JOIN pyq.practice_sessions s ON s.id = a.session_id
        WHERE a.user_id = ${userId}::uuid
          AND a.answered_at IS NOT NULL
          AND NOT (s.mode = 'TEST' AND s.status = 'IN_PROGRESS')
        GROUP BY 1
        ORDER BY 1`,
    ]);

    const attemptedIds = [...latest.keys()];
    const questionSubjects = await this.prisma.question.findMany({
      where: { id: { in: attemptedIds } },
      select: { id: true, subjectId: true },
    });
    const subjectSlug = new Map(subjects.map((row) => [row.id, row.slug]));
    const perSubject = new Map<string, { attempted: number; correct: number }>();
    for (const { id, subjectId } of questionSubjects) {
      const slug = subjectSlug.get(subjectId)!;
      const entry = perSubject.get(slug) ?? { attempted: 0, correct: 0 };
      entry.attempted += 1;
      if (latest.get(id)!.isCorrect) entry.correct += 1;
      perSubject.set(slug, entry);
    }

    const attempted = latest.size;
    const correct = [...latest.values()].filter((attempt) => attempt.isCorrect).length;
    const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

    let runningAnswered = 0;
    let runningCorrect = 0;
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
      bySubject: [...perSubject.entries()].map(([subjectId, entry]) => ({
        subjectId,
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
