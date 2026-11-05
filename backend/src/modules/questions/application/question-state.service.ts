import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DEFAULT_DAILY_TARGET } from './learning.service';

/** India is UTC+5:30 with no DST, so a fixed offset is exact. */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Keeps the PYQ read models — `user_question_states` and
 * `user_daily_activity` — in step with `attempts`.
 *
 * Every refresh *recomputes* the affected rows from attempts rather than
 * incrementing them, so a retry, a race between two tabs or a re-run after a
 * rollback converges on the right answer instead of double counting. Each
 * recompute reads one user's attempts at one question (or one day) through an
 * index, so it costs the same however long the student's history is.
 */
@Injectable()
export class QuestionStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rebuilds this user's state for these questions. Rows that no longer
   * describe anything (an unflag with no answer behind it) are removed, so
   * "has a row" keeps meaning "answered or flagged".
   */
  async refresh(userId: string, questionIds: string[], db: Db = this.prisma): Promise<void> {
    if (questionIds.length === 0) return;
    const ids = Prisma.sql`${questionIds}::uuid[]`;
    await db.$executeRaw`
      INSERT INTO pyq.user_question_states
        (user_id, question_id, latest_correct, last_answered_at, last_correct_at, last_wrong_at,
         attempt_count, incorrect_count, flagged, updated_at)
      SELECT a.user_id, a.question_id,
             (array_agg(a.is_correct ORDER BY a.answered_at DESC) FILTER (WHERE a.answered_at IS NOT NULL))[1],
             max(a.answered_at),
             max(a.answered_at) FILTER (WHERE a.is_correct),
             max(a.answered_at) FILTER (WHERE a.answered_at IS NOT NULL AND NOT a.is_correct),
             count(a.answered_at)::int,
             count(*) FILTER (WHERE a.answered_at IS NOT NULL AND NOT a.is_correct)::int,
             bool_or(a.flagged),
             now()
      FROM pyq.attempts a
      JOIN pyq.practice_sessions s ON s.id = a.session_id
      WHERE a.user_id = ${userId}::uuid
        AND a.question_id = ANY(${ids})
        AND NOT (s.mode = 'TEST' AND s.status = 'IN_PROGRESS')
      GROUP BY a.user_id, a.question_id
      ON CONFLICT (user_id, question_id) DO UPDATE SET
        latest_correct = EXCLUDED.latest_correct,
        last_answered_at = EXCLUDED.last_answered_at,
        last_correct_at = EXCLUDED.last_correct_at,
        last_wrong_at = EXCLUDED.last_wrong_at,
        attempt_count = EXCLUDED.attempt_count,
        incorrect_count = EXCLUDED.incorrect_count,
        flagged = EXCLUDED.flagged,
        updated_at = EXCLUDED.updated_at`;
    await db.$executeRaw`
      DELETE FROM pyq.user_question_states
      WHERE user_id = ${userId}::uuid
        AND question_id = ANY(${ids})
        AND attempt_count = 0
        AND NOT flagged`;
  }

  /**
   * Rebuilds the user's answer count for the India-time day containing `at`,
   * and records whether that day reached their daily goal — the thing the
   * streak counts.
   *
   * `goal_met` is kept rather than recomputed on read because the goal is
   * editable: comparing a past day's count against today's target would wipe
   * out a streak the moment a student raised it. For the same reason the
   * flag only ever goes true (`OR EXCLUDED.goal_met`) — a day earned at a
   * target of ten stays earned when the target becomes twenty an hour later.
   */
  async refreshDay(userId: string, at: Date, db: Db = this.prisma): Promise<void> {
    const shifted = at.getTime() + IST_OFFSET_MS;
    const start = new Date(shifted - (shifted % DAY_MS) - IST_OFFSET_MS);
    const end = new Date(start.getTime() + DAY_MS);
    const day = new Date(shifted - (shifted % DAY_MS)).toISOString().slice(0, 10);
    await db.$executeRaw`
      INSERT INTO pyq.user_daily_activity (user_id, day, answered, goal_met)
      SELECT ${userId}::uuid, ${day}::date, count(*)::int,
             count(*)::int >= COALESCE(
               (SELECT p.daily_target FROM pyq.user_preferences p WHERE p.user_id = ${userId}::uuid),
               ${DEFAULT_DAILY_TARGET})
      FROM pyq.attempts
      WHERE user_id = ${userId}::uuid AND answered_at >= ${start} AND answered_at < ${end}
      ON CONFLICT (user_id, day) DO UPDATE
        SET answered = EXCLUDED.answered,
            goal_met = pyq.user_daily_activity.goal_met OR EXCLUDED.goal_met`;
  }

  /** Every row from scratch — for `npm run db:pyq:rebuild-read-models`. */
  async rebuildAll(): Promise<{ states: number; days: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM pyq.user_question_states`;
      await tx.$executeRaw`DELETE FROM pyq.user_daily_activity`;
      const states = await tx.$executeRaw`
        INSERT INTO pyq.user_question_states
          (user_id, question_id, latest_correct, last_answered_at, last_correct_at, last_wrong_at,
           attempt_count, incorrect_count, flagged, updated_at)
        SELECT a.user_id, a.question_id,
               (array_agg(a.is_correct ORDER BY a.answered_at DESC) FILTER (WHERE a.answered_at IS NOT NULL))[1],
               max(a.answered_at),
               max(a.answered_at) FILTER (WHERE a.is_correct),
               max(a.answered_at) FILTER (WHERE a.answered_at IS NOT NULL AND NOT a.is_correct),
               count(a.answered_at)::int,
               count(*) FILTER (WHERE a.answered_at IS NOT NULL AND NOT a.is_correct)::int,
               bool_or(a.flagged),
               now()
        FROM pyq.attempts a
        JOIN pyq.practice_sessions s ON s.id = a.session_id
        WHERE NOT (s.mode = 'TEST' AND s.status = 'IN_PROGRESS')
        GROUP BY a.user_id, a.question_id
        HAVING count(a.answered_at) > 0 OR bool_or(a.flagged)`;
      // A full rebuild has no record of what each student's goal was on each
      // past day — only what it is now — so days are judged by the current
      // target. Routine refreshes keep the real thing; this is the fallback
      // for a rebuild after a rollback, and matches the backfill shipped with
      // the migration that added the column.
      const days = await tx.$executeRaw`
        INSERT INTO pyq.user_daily_activity (user_id, day, answered, goal_met)
        SELECT a.user_id, (a.answered_at AT TIME ZONE 'Asia/Kolkata')::date, count(*)::int,
               count(*)::int >= COALESCE(p.daily_target, ${DEFAULT_DAILY_TARGET})
        FROM pyq.attempts a
        LEFT JOIN pyq.user_preferences p ON p.user_id = a.user_id
        WHERE a.answered_at IS NOT NULL
        GROUP BY 1, 2, p.daily_target`;
      return { states, days };
    }, { timeout: 10 * 60_000 });
  }
}
