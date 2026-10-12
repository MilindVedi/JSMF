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
import { QuestionStateService } from './question-state.service';
import { QuestionBankService, type QuestionFilters } from './question-bank.service';
import { PyqAccessService } from './pyq-access.service';

export const MAX_SESSION_QUESTIONS = 200;
/** Network and clock slack after a timed test's deadline before answers are refused. */
const DEADLINE_GRACE_MS = 30_000;

export const SESSION_ORDERS = [
  'random',
  'unattempted-first',
  'incorrect-first',
  'bookmarked-first',
] as const;
export type SessionOrder = (typeof SESSION_ORDERS)[number];

/** Each ordering is the bank's own status filter, so "incorrect" means the latest answer. */
const PRIORITY_STATUS = {
  'unattempted-first': 'unattempted',
  'incorrect-first': 'incorrect',
  'bookmarked-first': 'bookmarked',
} as const;

export interface StartSessionInput {
  mode: PracticeMode;
  label?: string;
  /** Explicit set, in order. Takes precedence over filters. */
  questionIds?: string[];
  filters?: QuestionFilters;
  count?: number;
  /** Only with filters. */
  order?: SessionOrder;
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
  return scoreFromCounts(
    total,
    answered.length,
    answered.filter((attempt) => attempt.isCorrect).length,
    attempts.reduce((sum, a) => sum + a.timeSpentMs, 0),
  );
}

function scoreFromCounts(total: number, attempted: number, correct: number, timeSpentMs: number) {
  return {
    totalQuestions: total,
    attempted,
    correct,
    incorrect: attempted - correct,
    unattempted: total - attempted,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    totalTimeSec: Math.round(timeSpentMs / 1000),
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
    private readonly states: QuestionStateService,
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
      const order = input.order ?? 'random';
      const [pool, group] = await Promise.all([
        this.bank.matchingIds(userId, input.filters ?? {}),
        order === 'random'
          ? Promise.resolve<string[]>([])
          : this.bank.matchingIds(userId, { ...input.filters, status: PRIORITY_STATUS[order] }),
      ]);
      // The priority group goes first and the rest fills in behind it, each
      // shuffled, so "incorrect first" with few wrong answers still gives a
      // full test, and neither part comes out in a predictable order.
      const first = new Set(group);
      questionIds = [...shuffle(group), ...shuffle(pool.filter((id) => !first.has(id)))].slice(
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
      order: input.questionIds?.length ? undefined : (input.order ?? 'random'),
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
      const firstAnswer = !existing?.answeredAt;
      attempt = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.attempt.upsert({
          where: {
            sessionId_questionId: { sessionId, questionId: input.questionId },
          },
          create: { sessionId, questionId: input.questionId, userId, ...data },
          update: data,
        });
        // A running test's answers stay out of the per-question state until
        // submit; they still count towards the day (and the streak).
        if (session.mode !== PracticeMode.TEST) {
          await this.states.refresh(userId, [input.questionId], tx);
        }
        if (firstAnswer) await this.states.refreshDay(userId, data.answeredAt, tx);
        return saved;
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
    const attempt = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.attempt.upsert({
        where: { sessionId_questionId: { sessionId, questionId } },
        create: { sessionId, questionId, userId, flagged },
        update: { flagged },
      });
      if (revealsAnswers(session)) await this.states.refresh(userId, [questionId], tx);
      return saved;
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
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.practiceSession.updateMany({
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
        // A submitted test's answers now count: fold them into the state.
        if (result.count === 1 && session.mode === PracticeMode.TEST) {
          await this.states.refresh(
            userId,
            attempts.map((attempt) => attempt.questionId),
            tx,
          );
        }
        return result;
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

  /**
   * Newest first, optionally only open or only finished sessions. Everything
   * per session is aggregated in the database, so a page of 100 sessions is
   * three queries returning 100 rows each, not every question and attempt
   * behind them.
   */
  async history(userId: string, page: number, pageSize: number, status?: PracticeSessionStatus) {
    const where = { userId, ...(status ? { status } : {}) };
    const [total, sessions] = await Promise.all([
      this.prisma.practiceSession.count({ where }),
      this.prisma.practiceSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    if (sessions.length === 0) return { total, page, pageSize, items: [] };

    const ids = sessions.map((session) => session.id);
    const [scores, coverage] = await Promise.all([
      this.prisma.$queryRaw<
        { sessionId: string; attempted: number; correct: number; timeMs: number; lastWrongAt: Date | null }[]
      >`
        SELECT session_id AS "sessionId",
               count(answered_at)::int AS attempted,
               count(*) FILTER (WHERE answered_at IS NOT NULL AND is_correct)::int AS correct,
               coalesce(sum(time_spent_ms), 0)::int AS "timeMs",
               max(answered_at) FILTER (WHERE answered_at IS NOT NULL AND NOT is_correct) AS "lastWrongAt"
        FROM pyq.attempts
        WHERE session_id = ANY(${ids}::uuid[])
        GROUP BY session_id`,
      this.prisma.$queryRaw<
        {
          sessionId: string;
          examIds: string[];
          subjectIds: string[];
          newestYear: number;
          oldestYear: number;
          firstOpen: number | null;
          questions: number;
        }[]
      >`
        SELECT sq.session_id AS "sessionId",
               array_agg(DISTINCT e.slug) AS "examIds",
               array_agg(DISTINCT sub.slug) AS "subjectIds",
               max(q.year)::int AS "newestYear",
               min(q.year)::int AS "oldestYear",
               min(sq.position) FILTER (WHERE a.answered_at IS NULL) AS "firstOpen",
               count(*)::int AS questions
        FROM pyq.session_questions sq
        JOIN pyq.questions q ON q.id = sq.question_id
        JOIN pyq.exams e ON e.id = q.exam_id
        JOIN pyq.subjects sub ON sub.id = q.subject_id
        LEFT JOIN pyq.attempts a ON a.session_id = sq.session_id AND a.question_id = sq.question_id
        WHERE sq.session_id = ANY(${ids}::uuid[])
        GROUP BY sq.session_id`,
    ]);
    const scoreById = new Map(scores.map((row) => [row.sessionId, row]));
    const coverageById = new Map(coverage.map((row) => [row.sessionId, row]));

    return {
      total,
      page,
      pageSize,
      items: sessions.map((session) => {
        const counts = scoreById.get(session.id);
        const covers = coverageById.get(session.id);
        const reveal = revealsAnswers(session);
        return {
          ...this.summaryOf(
            session,
            scoreFromCounts(
              session.totalQuestions,
              counts?.attempted ?? 0,
              counts?.correct ?? 0,
              counts?.timeMs ?? 0,
            ),
          ),
          // From the questions themselves, so a session started from an
          // explicit list (bookmarks, revision) still says what it covers.
          examIds: covers?.examIds ?? [],
          subjectIds: covers?.subjectIds ?? [],
          newestYear: covers?.newestYear ?? null,
          oldestYear: covers?.oldestYear ?? null,
          // Correctness of an unsubmitted test stays hidden, here as everywhere.
          lastWrongAt: reveal ? (counts?.lastWrongAt ?? null) : null,
          resumeIndex: covers?.firstOpen ?? Math.max((covers?.questions ?? 1) - 1, 0),
        };
      }),
    };
  }

  private summary(session: PracticeSession, attempts: Attempt[]) {
    return this.summaryOf(session, scoreOf(session.totalQuestions, attempts));
  }

  private summaryOf(session: PracticeSession, score: ReturnType<typeof scoreFromCounts>) {
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
