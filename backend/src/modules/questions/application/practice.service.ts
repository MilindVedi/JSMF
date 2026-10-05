import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Attempt,
  PracticeMode,
  PracticeSession,
  PracticeSessionStatus,
  Prisma,
} from '@prisma/client';
import { randomInt } from 'node:crypto';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  QUESTION_VIEW_INCLUDE,
  VISIBLE_QUESTION,
  toAnsweredQuestionView,
  toQuestionView,
} from '../domain/question-view';
import { QuestionBankService, type QuestionFilters } from './question-bank.service';
import { PyqAccessService } from './pyq-access.service';

export const MAX_SESSION_QUESTIONS = 200;
/** Network and clock slack after a timed test's deadline before answers are refused. */
const DEADLINE_GRACE_MS = 30_000;

export interface StartSessionInput {
  mode: PracticeMode;
  label?: string;
  /** Explicit set, in order. Takes precedence over filters. */
  questionIds?: string[];
  filters?: QuestionFilters;
  count?: number;
  timeLimitSec?: number | null;
  /** Free-form context the web app wants back (e.g. its own mode, sourceHref). */
  meta?: Record<string, unknown>;
}

export interface AnswerInput {
  questionId: string;
  selectedOptionId: string;
  timeSpentMs?: number;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Feedback is immediate except in an unsubmitted TEST. */
function revealsAnswers(session: Pick<PracticeSession, 'mode' | 'status'>): boolean {
  return session.mode !== PracticeMode.TEST || session.status === PracticeSessionStatus.SUBMITTED;
}

function attemptView(attempt: Attempt, reveal: boolean) {
  return {
    questionId: attempt.questionId,
    selectedOptionId: attempt.selectedOptionId,
    isCorrect: reveal && attempt.answeredAt ? attempt.isCorrect : undefined,
    timeSpentMs: attempt.timeSpentMs,
    flagged: attempt.flagged,
    answeredAt: attempt.answeredAt,
  };
}

function scoreOf(total: number, attempts: Attempt[]) {
  const answered = attempts.filter((attempt) => attempt.answeredAt);
  const correct = answered.filter((attempt) => attempt.isCorrect).length;
  return {
    totalQuestions: total,
    attempted: answered.length,
    correct,
    incorrect: answered.length - correct,
    unattempted: total - answered.length,
    accuracy: answered.length ? Math.round((correct / answered.length) * 100) : 0,
    totalTimeSec: Math.round(attempts.reduce((sum, a) => sum + a.timeSpentMs, 0) / 1000),
  };
}

/**
 * A practice session: a fixed, ordered set of questions, answered one at a
 * time. Every read and write is scoped to the owner — another user's session
 * id is a 404, not a 403, so ids cannot be probed.
 */
@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bank: QuestionBankService,
    private readonly access: PyqAccessService,
  ) {}

  async start(userId: string, input: StartSessionInput) {
    let questionIds: string[];

    if (input.questionIds?.length) {
      const requested = [...new Set(input.questionIds)].slice(0, MAX_SESSION_QUESTIONS);
      const visible = await this.prisma.question.findMany({
        where: { ...VISIBLE_QUESTION, id: { in: requested } },
        select: { id: true },
      });
      const ok = new Set(visible.map((row) => row.id));
      questionIds = requested.filter((id) => ok.has(id));
    } else {
      const count = Math.min(input.count ?? 20, MAX_SESSION_QUESTIONS);
      questionIds = shuffle(await this.bank.matchingIds(userId, input.filters ?? {})).slice(
        0,
        count,
      );
    }

    if (questionIds.length === 0) {
      throw new BadRequestException('No questions match this selection');
    }

    // Starting a session the student cannot answer anything in is a dead end.
    await this.access.assertCanAnswer(userId);

    const config = {
      filters: input.questionIds?.length ? undefined : (input.filters ?? {}),
      ...(input.meta ?? {}),
    } as Prisma.InputJsonObject;

    const session = await this.prisma.practiceSession.create({
      data: {
        userId,
        mode: input.mode,
        label: input.label?.trim() || 'Practice session',
        config,
        timeLimitSec: input.timeLimitSec ?? null,
        totalQuestions: questionIds.length,
        questions: {
          create: questionIds.map((questionId, position) => ({
            questionId,
            position,
          })),
        },
      },
    });

    activity(this.logger, 'practice.session_started', {
      userId,
      sessionId: session.id,
      mode: session.mode,
      questions: questionIds.length,
    });
    return this.get(userId, session.id);
  }

  async get(userId: string, sessionId: string) {
    const session = await this.owned(userId, sessionId);
    const reveal = revealsAnswers(session);
    const [entries, attempts] = await Promise.all([
      this.prisma.sessionQuestion.findMany({
        where: { sessionId },
        orderBy: { position: 'asc' },
        include: { question: { include: QUESTION_VIEW_INCLUDE } },
      }),
      this.prisma.attempt.findMany({ where: { sessionId } }),
    ]);
    const attemptByQuestion = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));

    return {
      ...this.summary(session, attempts),
      questions: entries.map(({ question }) => {
        // In practice modes an answer is revealed per question, once answered.
        const answered = Boolean(attemptByQuestion.get(question.id)?.answeredAt);
        return reveal && (answered || session.status === PracticeSessionStatus.SUBMITTED)
          ? toAnsweredQuestionView(question)
          : toQuestionView(question);
      }),
      attempts: Object.fromEntries(
        attempts.map((attempt) => [attempt.questionId, attemptView(attempt, reveal)]),
      ),
    };
  }

  async answer(userId: string, sessionId: string, input: AnswerInput) {
    const session = await this.owned(userId, sessionId);
    this.assertOpen(session);
    await this.assertInSession(sessionId, input.questionId);

    const option = await this.prisma.questionOption.findFirst({
      where: { id: input.selectedOptionId, questionId: input.questionId },
    });
    if (!option) throw new BadRequestException('That option does not belong to this question');

    const existing = await this.prisma.attempt.findUnique({
      where: {
        sessionId_questionId: { sessionId, questionId: input.questionId },
      },
    });

    let attempt: Attempt;
    if (existing?.answeredAt && session.mode !== PracticeMode.TEST) {
      // Practice answers are final once the explanation has been shown —
      // otherwise "change to the right answer" would inflate every score.
      attempt = existing;
    } else {
      // Only a first answer spends allowance; changing a test answer does not.
      if (!existing?.answeredAt) await this.access.assertCanAnswer(userId);
      const data = {
        selectedOptionId: option.id,
        isCorrect: option.isCorrect,
        timeSpentMs: (existing?.timeSpentMs ?? 0) + Math.max(0, input.timeSpentMs ?? 0),
        answeredAt: existing?.answeredAt ?? new Date(),
      };
      attempt = await this.prisma.attempt.upsert({
        where: {
          sessionId_questionId: { sessionId, questionId: input.questionId },
        },
        create: { sessionId, questionId: input.questionId, userId, ...data },
        update: data,
      });
    }

    if (session.mode === PracticeMode.TEST) {
      return {
        questionId: attempt.questionId,
        selectedOptionId: attempt.selectedOptionId,
        recorded: true,
      };
    }

    const question = await this.prisma.question.findUniqueOrThrow({
      where: { id: input.questionId },
      include: QUESTION_VIEW_INCLUDE,
    });
    const answered = toAnsweredQuestionView(question);
    return {
      questionId: attempt.questionId,
      selectedOptionId: attempt.selectedOptionId,
      recorded: true,
      isCorrect: attempt.isCorrect,
      correctOptionId: answered.correctOptionId,
      explanation: answered.explanation,
      explanationImageUrl: answered.explanationImageUrl,
      explanationFigure: answered.explanationFigure,
    };
  }

  async flag(userId: string, sessionId: string, questionId: string, flagged: boolean) {
    const session = await this.owned(userId, sessionId);
    this.assertOpen(session);
    await this.assertInSession(sessionId, questionId);
    const attempt = await this.prisma.attempt.upsert({
      where: { sessionId_questionId: { sessionId, questionId } },
      create: { sessionId, questionId, userId, flagged },
      update: { flagged },
    });
    return { questionId, flagged: attempt.flagged };
  }

  /** Idempotent: submitting twice returns the same score. */
  async submit(userId: string, sessionId: string) {
    const session = await this.owned(userId, sessionId);
    if (session.status === PracticeSessionStatus.IN_PROGRESS) {
      const attempts = await this.prisma.attempt.findMany({
        where: { sessionId },
      });
      const score = scoreOf(session.totalQuestions, attempts);
      const updated = await this.prisma.practiceSession.updateMany({
        where: { id: sessionId, status: PracticeSessionStatus.IN_PROGRESS },
        data: {
          status: PracticeSessionStatus.SUBMITTED,
          submittedAt: new Date(),
          correctCount: score.correct,
          incorrectCount: score.incorrect,
          unattemptedCount: score.unattempted,
          accuracy: score.accuracy,
        },
      });
      if (updated.count === 1) {
        activity(this.logger, 'practice.session_submitted', {
          userId,
          sessionId,
          mode: session.mode,
          ...score,
        });
      }
    }
    return this.review(userId, sessionId);
  }

  /** Full answers and explanations — only once the session is submitted. */
  async review(userId: string, sessionId: string) {
    const session = await this.owned(userId, sessionId);
    if (session.status !== PracticeSessionStatus.SUBMITTED) {
      throw new ConflictException('Submit the session to see its review');
    }
    return this.get(userId, sessionId);
  }

  async history(userId: string, page: number, pageSize: number) {
    const where = { userId };
    const [total, sessions] = await Promise.all([
      this.prisma.practiceSession.count({ where }),
      this.prisma.practiceSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const attempts = await this.prisma.attempt.findMany({
      where: { sessionId: { in: sessions.map((session) => session.id) } },
    });
    return {
      total,
      page,
      pageSize,
      items: sessions.map((session) =>
        this.summary(
          session,
          attempts.filter((attempt) => attempt.sessionId === session.id),
        ),
      ),
    };
  }

  private summary(session: PracticeSession, attempts: Attempt[]) {
    const score = scoreOf(session.totalQuestions, attempts);
    const reveal = revealsAnswers(session);
    return {
      id: session.id,
      mode: session.mode,
      label: session.label,
      config: session.config,
      timeLimitSec: session.timeLimitSec,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      // An unsubmitted test reports progress, never correctness.
      ...(reveal
        ? score
        : {
            totalQuestions: score.totalQuestions,
            attempted: score.attempted,
            unattempted: score.unattempted,
            totalTimeSec: score.totalTimeSec,
          }),
    };
  }

  private async owned(userId: string, sessionId: string): Promise<PracticeSession> {
    const session = await this.prisma.practiceSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private assertOpen(session: PracticeSession): void {
    if (session.status !== PracticeSessionStatus.IN_PROGRESS) {
      throw new ConflictException('This session has already been submitted');
    }
    if (
      session.timeLimitSec &&
      Date.now() > session.startedAt.getTime() + session.timeLimitSec * 1000 + DEADLINE_GRACE_MS
    ) {
      throw new ConflictException('Time is up for this session — submit it to see your score');
    }
  }

  private async assertInSession(sessionId: string, questionId: string): Promise<void> {
    const entry = await this.prisma.sessionQuestion.findUnique({
      where: { sessionId_questionId: { sessionId, questionId } },
    });
    if (!entry) throw new BadRequestException('That question is not part of this session');
  }
}
