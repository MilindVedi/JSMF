import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessType,
  Difficulty,
  EntitlementSource,
  PracticeMode,
  ProductStatus,
  ProductType,
  QuestionStatus,
  UserStatus,
} from '@prisma/client';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { PracticeService } from './practice.service';
import { ProgressService } from './progress.service';
import { PYQ_SUBSCRIPTION_METADATA_KEY, PyqAccessService } from './pyq-access.service';
import { QuestionBankService } from './question-bank.service';
import { QuestionImportService, type ImportInput } from './question-import.service';

/**
 * The PYQ bank and practice flow against a real Postgres, wired by hand like
 * the other integration specs. The properties that matter are about what a
 * student can see and when: answers never in a list, never in an unsubmitted
 * test, never in someone else's session — and the free allowance holding.
 *
 * Every row lives under a taxonomy slug unique to this run and is deleted by
 * its own id afterwards.
 */

let freeDaily = 1000;
const config = {
  get(key: string) {
    if (key === 'PYQ_FREE_DAILY_QUESTIONS') return freeDaily;
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

const run = randomUUID().slice(0, 8);
const EXAM = `spec-exam-${run}`;
const SUBJECT = `spec-subject-${run}`;
const TOPIC = `${SUBJECT}--cardiology`;
const created = { userIds: [] as string[], productIds: [] as string[] };

function importInput(stemSuffix = ''): ImportInput {
  return {
    exams: [{ slug: EXAM, name: 'Spec Exam', shortName: 'SPEC' }],
    subjects: [{ slug: SUBJECT, name: 'Spec Subject', group: 'clinical' }],
    topics: [{ slug: TOPIC, subjectSlug: SUBJECT, name: 'Cardiology' }],
    questions: Array.from({ length: 5 }, (_, i) => ({
      externalKey: `spec-${run}-${i}`,
      examSlug: EXAM,
      subjectSlug: SUBJECT,
      topicSlug: TOPIC,
      year: 2020 + (i % 2),
      stem: `Question ${i}${stemSuffix}`,
      explanation: `Because ${i}`,
      difficulty: Difficulty.MEDIUM,
      status: QuestionStatus.PUBLISHED,
      options: ['A', 'B', 'C', 'D'].map((text, j) => ({ text, isCorrect: j === 0 })),
    })),
  };
}

async function createUser() {
  const user = await prisma.user.create({
    data: {
      email: `pyq-spec-${randomUUID()}@jsmf.test`,
      name: 'PYQ Spec',
      status: UserStatus.ACTIVE,
    },
  });
  created.userIds.push(user.id);
  return user;
}

const filters = { subjectIds: [SUBJECT] };

async function questionIds() {
  const rows = await prisma.question.findMany({
    where: { externalKey: { startsWith: `spec-${run}-` } },
    orderBy: { externalKey: 'asc' },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  });
  return rows;
}

beforeAll(async () => {
  await prisma.$connect();
  await importer.import(importInput());
});

afterAll(async () => {
  await prisma.practiceSession.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.question.deleteMany({ where: { externalKey: { startsWith: `spec-${run}-` } } });
  await prisma.topic.deleteMany({ where: { slug: TOPIC } });
  await prisma.subject.deleteMany({ where: { slug: SUBJECT } });
  await prisma.exam.deleteMany({ where: { slug: EXAM } });
  await prisma.entitlement.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
});

describe('import', () => {
  it('is idempotent on externalKey and keeps option ids stable', async () => {
    const before = await questionIds();
    const result = await importer.import(importInput(' (edited)'));

    expect(result).toMatchObject({ created: 0, updated: 5 });
    const after = await questionIds();
    expect(after).toHaveLength(5);
    expect(after[0].stem).toBe('Question 0 (edited)');
    expect(after[0].options.map((o) => o.id)).toEqual(before[0].options.map((o) => o.id));
  });

  it('rejects a question without exactly one correct option', async () => {
    const input = importInput();
    input.questions = [
      {
        ...input.questions[0],
        externalKey: `spec-${run}-bad`,
        options: input.questions[0].options.map((o) => ({ ...o, isCorrect: true })),
      },
    ];
    await expect(importer.import(input)).rejects.toThrow(/exactly one correct/);
  });
});

describe('listing', () => {
  it('never includes answers or explanations', async () => {
    const user = await createUser();
    const page = await bank.list(user.id, filters, 1, 50);

    expect(page.total).toBe(5);
    const json = JSON.stringify(page.items);
    expect(json).not.toContain('isCorrect');
    expect(json).not.toContain('explanation');
    expect(json).not.toContain('correctOptionId');
    expect(page.items[0]).toMatchObject({ subjectId: SUBJECT, examId: EXAM, topicId: TOPIC });
  });

  it('hides drafts', async () => {
    const user = await createUser();
    const [first] = await questionIds();
    await bank.setStatus(first.id, QuestionStatus.DRAFT);
    expect((await bank.list(user.id, filters, 1, 50)).total).toBe(4);
    await bank.setStatus(first.id, QuestionStatus.PUBLISHED);
  });
});

describe('practice mode', () => {
  it('returns correctness and explanation immediately, and locks the answer', async () => {
    const user = await createUser();
    const session = await practice.start(user.id, {
      mode: PracticeMode.PRACTICE,
      filters,
      count: 3,
    });
    expect(session.questions).toHaveLength(3);
    expect(JSON.stringify(session.questions)).not.toContain('explanation');

    const q = session.questions[0];
    const wrong = q.options[1].id;
    const result = await practice.answer(user.id, session.id, {
      questionId: q.id,
      selectedOptionId: wrong,
    });
    expect(result).toMatchObject({ isCorrect: false, correctOptionId: q.options[0].id });
    expect('explanation' in result && result.explanation).toMatch(/^Because/);

    // Changing to the right answer after seeing it is not allowed.
    const again = await practice.answer(user.id, session.id, {
      questionId: q.id,
      selectedOptionId: q.options[0].id,
    });
    expect(again).toMatchObject({ isCorrect: false, selectedOptionId: wrong });

    const reread = await practice.get(user.id, session.id);
    expect(reread.questions[0]).toHaveProperty('explanation');
    expect(reread.questions[1]).not.toHaveProperty('explanation');

    const wrongList = await progress.wrongQuestions(user.id);
    expect(wrongList.map((w) => w.id)).toEqual([q.id]);
  });
});

describe('test mode', () => {
  it('hides answers until submit, then scores and reveals', async () => {
    const user = await createUser();
    const session = await practice.start(user.id, {
      mode: PracticeMode.TEST,
      filters,
      count: 4,
      timeLimitSec: 600,
    });
    const [q1, q2, q3] = session.questions;

    const recorded = await practice.answer(user.id, session.id, {
      questionId: q1.id,
      selectedOptionId: q1.options[0].id,
    });
    expect(recorded).toEqual({
      questionId: q1.id,
      selectedOptionId: q1.options[0].id,
      recorded: true,
    });
    // Changing an answer before submit is allowed in a test.
    await practice.answer(user.id, session.id, {
      questionId: q2.id,
      selectedOptionId: q2.options[0].id,
    });
    await practice.answer(user.id, session.id, {
      questionId: q2.id,
      selectedOptionId: q2.options[2].id,
    });
    await practice.flag(user.id, session.id, q3.id, true);

    const during = await practice.get(user.id, session.id);
    const json = JSON.stringify(during);
    expect(json).not.toContain('explanation');
    expect(json).not.toContain('correctOptionId');
    expect(json).not.toContain('isCorrect');
    expect(during).not.toHaveProperty('correct');
    expect(during.attempts[q3.id].flagged).toBe(true);
    await expect(practice.review(user.id, session.id)).rejects.toBeInstanceOf(ConflictException);
    // Not leaked through the wrong-questions list either.
    expect(await progress.wrongQuestions(user.id)).toHaveLength(0);

    const review = await practice.submit(user.id, session.id);
    expect(review).toMatchObject({
      status: 'SUBMITTED',
      totalQuestions: 4,
      attempted: 2,
      correct: 1,
      incorrect: 1,
      unattempted: 2,
      accuracy: 50,
    });
    expect(review.questions.every((q) => 'explanation' in q)).toBe(true);
    expect(review.attempts[q2.id].isCorrect).toBe(false);

    const stored = await prisma.practiceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored).toMatchObject({
      correctCount: 1,
      incorrectCount: 1,
      unattemptedCount: 2,
      accuracy: 50,
    });

    // Submitting twice is harmless; answering afterwards is not allowed.
    expect(await practice.submit(user.id, session.id)).toMatchObject({ correct: 1 });
    await expect(
      practice.answer(user.id, session.id, {
        questionId: q3.id,
        selectedOptionId: q3.options[0].id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const history = await practice.history(user.id, 1, 10);
    expect(history.items[0]).toMatchObject({ id: session.id, correct: 1 });
    const stats = await progress.stats(user.id);
    expect(stats).toMatchObject({ attempted: 2, correct: 1, incorrect: 1 });
    expect(stats.bySubject).toEqual([
      { subjectId: SUBJECT, attempted: 2, correct: 1, incorrect: 1, accuracy: 50 },
    ]);
  });
});

describe('ownership', () => {
  it('another user cannot read or answer someone else’s session', async () => {
    const owner = await createUser();
    const other = await createUser();
    const session = await practice.start(owner.id, {
      mode: PracticeMode.PRACTICE,
      filters,
      count: 1,
    });
    const q = session.questions[0];

    await expect(practice.get(other.id, session.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      practice.answer(other.id, session.id, {
        questionId: q.id,
        selectedOptionId: q.options[0].id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(practice.submit(other.id, session.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('free allowance', () => {
  it('blocks answers past the daily limit unless the user holds a PYQ subscription', async () => {
    freeDaily = 2;
    try {
      const user = await createUser();
      const session = await practice.start(user.id, {
        mode: PracticeMode.PRACTICE,
        filters,
        count: 3,
      });
      const [a, b, c] = session.questions;
      await practice.answer(user.id, session.id, {
        questionId: a.id,
        selectedOptionId: a.options[0].id,
      });
      await practice.answer(user.id, session.id, {
        questionId: b.id,
        selectedOptionId: b.options[0].id,
      });
      await expect(
        practice.answer(user.id, session.id, {
          questionId: c.id,
          selectedOptionId: c.options[0].id,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await access.describe(user.id)).toMatchObject({
        subscribed: false,
        remainingToday: 0,
      });
      await expect(
        practice.start(user.id, { mode: PracticeMode.PRACTICE, filters, count: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const plan = await prisma.product.create({
        data: {
          slug: `pyq-spec-plan-${randomUUID()}`,
          title: 'PYQ Pro',
          type: ProductType.COURSE,
          status: ProductStatus.PUBLISHED,
          accessType: AccessType.PAID,
          priceAmountMinor: 49900n,
          metadata: { [PYQ_SUBSCRIPTION_METADATA_KEY]: true },
        },
      });
      created.productIds.push(plan.id);
      await entitlements.grant({
        userId: user.id,
        productId: plan.id,
        source: EntitlementSource.ADMIN_GRANT,
      });

      const result = await practice.answer(user.id, session.id, {
        questionId: c.id,
        selectedOptionId: c.options[0].id,
      });
      expect(result).toMatchObject({ isCorrect: true });
      expect(await access.describe(user.id)).toMatchObject({
        subscribed: true,
        remainingToday: null,
      });
    } finally {
      freeDaily = 1000;
    }
  });
});

describe('bookmarks and reports', () => {
  it('bookmarks idempotently and filters by them', async () => {
    const user = await createUser();
    const [q] = await questionIds();
    await progress.addBookmark(user.id, q.id);
    await progress.addBookmark(user.id, q.id);
    expect(await progress.listBookmarks(user.id)).toHaveLength(1);
    expect((await bank.list(user.id, { ...filters, status: 'bookmarked' }, 1, 50)).total).toBe(1);
    await progress.removeBookmark(user.id, q.id);
    expect(await progress.listBookmarks(user.id)).toHaveLength(0);

    const report = await progress.report(user.id, q.id, {
      reason: 'WRONG_ANSWER',
      details: 'B is right',
    });
    expect(report.status).toBe('OPEN');
    await prisma.questionReport.delete({ where: { id: report.id } });
  });
});
