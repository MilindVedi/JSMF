import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Difficulty, PracticeMode, QuestionStatus, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { CollectionsService } from './collections.service';
import { LearningService, computeStreak, istDay } from './learning.service';
import { PracticeService } from './practice.service';
import { ProgressService } from './progress.service';
import { PyqAccessService } from './pyq-access.service';
import { QuestionBankService } from './question-bank.service';
import { QuestionImportService } from './question-import.service';

/**
 * Phase 2 learning features against a real Postgres: collections (and that
 * they stay private), streaks by India-time day, the revision and reinforce
 * lists, preferences, and timed custom tests running as TEST sessions.
 */

const config = {
  get(key: string) {
    if (key === 'PYQ_FREE_DAILY_QUESTIONS') return 1000;
    return process.env[key];
  },
} as never;

const prisma = new PrismaService();
const entitlements = new EntitlementService(prisma);
const access = new PyqAccessService(prisma, entitlements, config);
const bank = new QuestionBankService(prisma);
const importer = new QuestionImportService(prisma);
const practice = new PracticeService(prisma, bank, access);
const progress = new ProgressService(prisma, bank);
const collections = new CollectionsService(prisma);
const learning = new LearningService(prisma, bank);

const run = randomUUID().slice(0, 8);
const EXAM = `spec-lexam-${run}`;
const SUBJECT = `spec-lsubject-${run}`;
const userIds: string[] = [];
const filters = { subjectIds: [SUBJECT] };

async function createUser() {
  const user = await prisma.user.create({
    data: { email: `pyq-learn-${randomUUID()}@jsmf.test`, name: 'Learn Spec', status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);
  return user;
}

async function questions() {
  return prisma.question.findMany({
    where: { externalKey: { startsWith: `spec-learn-${run}-` } },
    orderBy: { externalKey: 'asc' },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  });
}

/** Writes an answered attempt at an exact instant, bypassing the clock. */
async function answerAt(userId: string, sessionId: string, questionIndex: number, correct: boolean, at: Date) {
  const q = (await questions())[questionIndex];
  const option = q.options.find((o) => o.isCorrect === correct)!;
  await prisma.attempt.upsert({
    where: { sessionId_questionId: { sessionId, questionId: q.id } },
    create: { sessionId, questionId: q.id, userId, selectedOptionId: option.id, isCorrect: correct, answeredAt: at },
    update: { selectedOptionId: option.id, isCorrect: correct, answeredAt: at },
  });
  return q.id;
}

async function practiceSession(userId: string) {
  return practice.start(userId, { mode: PracticeMode.PRACTICE, questionIds: (await questions()).map((q) => q.id) });
}

beforeAll(async () => {
  await prisma.$connect();
  await importer.import({
    exams: [{ slug: EXAM, name: 'Learn Exam', shortName: 'LRN' }],
    subjects: [{ slug: SUBJECT, name: 'Learn Subject', group: 'clinical' }],
    topics: [],
    questions: Array.from({ length: 6 }, (_, i) => ({
      externalKey: `spec-learn-${run}-${i}`,
      examSlug: EXAM,
      subjectSlug: SUBJECT,
      year: 2021,
      stem: `Learning question ${i}`,
      explanation: `Because ${i}`,
      difficulty: Difficulty.EASY,
      status: QuestionStatus.PUBLISHED,
      options: ['A', 'B', 'C', 'D'].map((text, j) => ({ text, isCorrect: j === 0 })),
    })),
  });
});

afterAll(async () => {
  await prisma.questionCollection.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.practiceSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.question.deleteMany({ where: { externalKey: { startsWith: `spec-learn-${run}-` } } });
  await prisma.subject.deleteMany({ where: { slug: SUBJECT } });
  await prisma.exam.deleteMany({ where: { slug: EXAM } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('collections', () => {
  it('supports create, rename, add/remove questions and delete', async () => {
    const user = await createUser();
    const [q0, q1, q2] = await questions();

    const created = await collections.create(user.id, { name: '  Cardio  ', questionIds: [q0.id, q0.id] });
    expect(created).toMatchObject({ name: 'Cardio', questionIds: [q0.id] });

    await collections.addQuestion(user.id, created.id, q1.id);
    const twice = await collections.addQuestion(user.id, created.id, q1.id);
    expect(twice.questionIds).toEqual([q0.id, q1.id]);

    const removed = await collections.removeQuestion(user.id, created.id, q0.id);
    expect(removed.questionIds).toEqual([q1.id]);

    const renamed = await collections.update(user.id, created.id, { name: 'Heart', description: 'Valves' });
    expect(renamed).toMatchObject({ name: 'Heart', description: 'Valves' });

    await expect(collections.addQuestion(user.id, created.id, randomUUID())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await collections.create(user.id, { name: 'Second', questionIds: [q2.id] });
    expect((await collections.list(user.id)).map((c) => c.name)).toEqual(['Second', 'Heart']);

    await collections.remove(user.id, created.id);
    expect((await collections.list(user.id)).map((c) => c.name)).toEqual(['Second']);
  });

  it("are invisible and untouchable to another user", async () => {
    const owner = await createUser();
    const other = await createUser();
    const [q0] = await questions();
    const mine = await collections.create(owner.id, { name: 'Private', questionIds: [q0.id] });

    expect(await collections.list(other.id)).toEqual([]);
    await expect(collections.get(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(collections.update(other.id, mine.id, { name: 'Mine now' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(collections.addQuestion(other.id, mine.id, q0.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(collections.removeQuestion(other.id, mine.id, q0.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(collections.remove(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await collections.get(owner.id, mine.id)).questionIds).toEqual([q0.id]);
    // Filtering the bank by a collection only ever sees your own.
    expect((await bank.list(owner.id, { collectionIds: [mine.id] }, 1, 50)).total).toBe(1);
    expect((await bank.list(other.id, { collectionIds: [mine.id] }, 1, 50)).total).toBe(0);
  });
});

describe('streak', () => {
  it('counts India-time days, not UTC days', () => {
    // 18:20Z and 18:40Z are the same UTC day but either side of IST midnight.
    expect(istDay(new Date('2026-03-09T18:20:00Z'))).toBe('2026-03-09');
    expect(istDay(new Date('2026-03-09T18:40:00Z'))).toBe('2026-03-10');
    expect(computeStreak(['2026-03-01', '2026-03-02', '2026-03-04'], '2026-03-05')).toMatchObject({
      current: 1,
      longest: 2,
    });
  });

  it('builds current/longest/today from attempts across IST midnight', async () => {
    const user = await createUser();
    const session = await practiceSession(user.id);
    await answerAt(user.id, session.id, 0, true, new Date('2026-03-09T18:20:00Z')); // IST 9th 23:50
    await answerAt(user.id, session.id, 1, true, new Date('2026-03-09T18:40:00Z')); // IST 10th 00:10
    await answerAt(user.id, session.id, 2, false, new Date('2026-03-10T19:00:00Z')); // IST 11th 00:30

    const onEleventh = await learning.streak(user.id, new Date('2026-03-11T10:00:00Z'));
    expect(onEleventh).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
      today: '2026-03-11',
      todayCount: 1,
      dailyTarget: 10,
      todayDone: false,
    });

    // Late on the 12th (IST) the run is still alive...
    expect(await learning.streak(user.id, new Date('2026-03-12T18:00:00Z'))).toMatchObject({
      currentStreak: 3,
      todayCount: 0,
    });
    // ...and one minute past IST midnight it has lapsed; the record stays.
    expect(await learning.streak(user.id, new Date('2026-03-12T18:31:00Z'))).toMatchObject({
      currentStreak: 0,
      longestStreak: 3,
    });

    await learning.updatePreferences(user.id, { dailyTarget: 1 });
    expect(await learning.streak(user.id, new Date('2026-03-11T10:00:00Z'))).toMatchObject({ todayDone: true });
  });
});

describe('revision and reinforce', () => {
  it('lists wrong, flagged, stale-correct, bookmarked and collected questions with facts', async () => {
    const user = await createUser();
    const qs = await questions();
    const now = new Date();
    const session = await practiceSession(user.id);
    const old = new Date(now.getTime() - 40 * 86_400_000);
    const recent = new Date(now.getTime() - 60_000);

    await answerAt(user.id, session.id, 0, false, recent); // wrong, never corrected
    await answerAt(user.id, session.id, 1, true, recent); // correct, fresh
    await answerAt(user.id, session.id, 2, true, old); // correct but stale
    await practice.flag(user.id, session.id, qs[3].id, true); // flagged, unanswered
    await progress.addBookmark(user.id, qs[4].id);
    const col = await collections.create(user.id, { name: 'C', questionIds: [qs[5].id] });

    // A later wrong answer to question 1 makes it wrong, but it was once correct.
    const second = await practiceSession(user.id);
    await answerAt(user.id, second.id, 1, false, now); // latest for q1 is now wrong

    const { items } = await learning.revision(user.id, now);
    const byId = new Map(items.map((item) => [item.question.id, item]));
    expect(byId.size).toBe(6);
    expect(byId.get(qs[0].id)).toMatchObject({ latestCorrect: false, neverCorrected: true, due: true, incorrectCount: 1 });
    expect(byId.get(qs[1].id)).toMatchObject({ latestCorrect: false, neverCorrected: false, attemptCount: 2, due: true });
    expect(byId.get(qs[2].id)).toMatchObject({ latestCorrect: true, due: true });
    expect(byId.get(qs[3].id)).toMatchObject({ latestCorrect: null, flagged: true, due: true });
    expect(byId.get(qs[4].id)).toMatchObject({ latestCorrect: null, due: false });
    expect(byId.get(qs[4].id)!.bookmarkedAt).not.toBeNull();
    expect(byId.get(qs[5].id)!.collectedAt).not.toBeNull();
    expect(JSON.stringify(items)).not.toContain('correctOptionId');

    const reinforce = await learning.reinforce(user.id, 7, now);
    expect(reinforce.all.map((q) => q.id)).toEqual([qs[2].id]);
    expect(reinforce.recentIds).toEqual([]);
    expect(reinforce.notRevisitedIds).toEqual([qs[2].id]);

    // Another user sees none of it.
    const other = await createUser();
    expect((await learning.revision(other.id)).items).toEqual([]);
    await collections.remove(user.id, col.id);
  });
});

describe('preferences', () => {
  it('defaults, saves and validates the target exam', async () => {
    const user = await createUser();
    expect(await learning.preferences(user.id)).toEqual({ targetExamId: null, dailyTarget: 10 });
    expect(await learning.updatePreferences(user.id, { targetExamId: EXAM })).toEqual({
      targetExamId: EXAM,
      dailyTarget: 10,
    });
    await expect(learning.updatePreferences(user.id, { targetExamId: 'no-such-exam' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect((await learning.preferences(user.id)).targetExamId).toBe(EXAM);
  });
});

describe('custom test as TEST mode', () => {
  it('hides correctness until submit and keeps answers off the revision list meanwhile', async () => {
    const user = await createUser();
    const session = await practice.start(user.id, {
      mode: PracticeMode.TEST,
      filters,
      count: 3,
      timeLimitSec: 600,
      meta: { uiMode: 'custom-test' },
    });
    const first = (await questions()).find((q) => q.id === session.questions[0].id)!;
    const wrong = first.options.find((o) => !o.isCorrect)!;

    const answer = await practice.answer(user.id, session.id, { questionId: first.id, selectedOptionId: wrong.id });
    expect(answer).not.toHaveProperty('isCorrect');
    expect(answer).not.toHaveProperty('correctOptionId');
    const during = await practice.get(user.id, session.id);
    expect(JSON.stringify(during)).not.toContain('correctOptionId');
    expect(during.attempts[first.id].isCorrect).toBeUndefined();
    expect((await learning.revision(user.id)).items).toEqual([]);

    await practice.submit(user.id, session.id);
    const review = await practice.review(user.id, session.id);
    expect(review.attempts[first.id].isCorrect).toBe(false);
    const after = await learning.revision(user.id);
    expect(after.items.map((item) => item.question.id)).toEqual([first.id]);
  });
});
