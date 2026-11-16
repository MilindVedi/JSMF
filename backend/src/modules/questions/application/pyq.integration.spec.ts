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
import type { ExamSetupService } from './exam-setup.service';
import { ProgressService } from './progress.service';
import { PyqAccessService } from './pyq-access.service';
import { PYQ_PLAN_KEY } from '../../../shared/pyq-plan';
import { CacheService } from '../../../shared/cache/cache.service';
import { QuestionStateService } from './question-state.service';
import { QuestionBankService } from './question-bank.service';
import { QuestionImportService, type ImportInput } from './question-import.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { PyqSubscriptionService } from './pyq-subscription.service';
import { QuestionImageLinks } from './question-image-links';

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
// Pass-through cache: these tests change settings between reads.
const subscriptions = new PyqSubscriptionService(prisma, new AuditService(prisma), { wrap: (_key: string, _ttl: number, load: () => unknown) => load(), del: async () => {} } as never, config);
const access = new PyqAccessService(prisma, config, subscriptions);
const cache = new CacheService({ get: () => false } as never);
const bank = new QuestionBankService(prisma, cache);
const states = new QuestionStateService(prisma);
const importer = new QuestionImportService(prisma);
// Options in written order here; shuffling has its own spec (exam-mode.integration.spec.ts).
const examSetup = { settings: async () => ({ shuffleOptions: false }) } as unknown as ExamSetupService;
// No test here uploads an image, so signing one would be a bug: this storage refuses.
const imageLinks = new QuestionImageLinks(
  { getSignedDownloadUrl: () => Promise.reject(new Error('no image storage in this test')) } as never,
  config as never,
);
const practice = new PracticeService(prisma, bank, access, states, examSetup, imageLinks);
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

// Exam papers (session month) get their own subject and an unused year, so
// they never change what the other tests draw from or count.
const PAPER_SUBJECT = `spec-papers-${run}`;
const PAPER_KEY_PREFIX = `spec-paper-${run}-`;
const PAPER_YEAR = 1951;
// Explanation parts likewise get their own subject.
const PARTS_SUBJECT = `spec-parts-${run}`;
const PARTS_KEY_PREFIX = `spec-parts-${run}-`;

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
  await prisma.question.deleteMany({ where: { externalKey: { startsWith: PAPER_KEY_PREFIX } } });
  await prisma.question.deleteMany({ where: { externalKey: { startsWith: PARTS_KEY_PREFIX } } });
  await prisma.topic.deleteMany({ where: { slug: TOPIC } });
  await prisma.subject.deleteMany({ where: { slug: { in: [SUBJECT, PAPER_SUBJECT, PARTS_SUBJECT] } } });
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

  it('refuses an exam or subject it does not know, and writes nothing', async () => {
    const typo = `spec-subjectt-${run}`;
    const missingExam = `spec-no-exam-${run}`;
    const input = importInput();
    input.questions = [
      { ...input.questions[0], externalKey: `spec-${run}-typo`, subjectSlug: typo, topicSlug: null },
      { ...input.questions[1], externalKey: `spec-${run}-no-exam`, examSlug: missingExam },
    ];

    const refused = importer.import(input);
    await expect(refused).rejects.toThrow(`Unknown subject "${typo}" (question spec-${run}-typo)`);
    await expect(refused).rejects.toThrow(`Unknown exam "${missingExam}" (question spec-${run}-no-exam)`);
    // A topic naming an unknown subject is refused the same way.
    await expect(
      importer.import({ ...importInput(), topics: [{ slug: `${typo}--x`, subjectSlug: typo, name: 'X' }] }),
    ).rejects.toThrow(`Unknown subject "${typo}" (topic ${typo}--x)`);

    expect(await prisma.subject.count({ where: { slug: typo } })).toBe(0);
    expect(await prisma.exam.count({ where: { slug: missingExam } })).toBe(0);
    expect(await prisma.question.count({ where: { externalKey: { in: [`spec-${run}-typo`, `spec-${run}-no-exam`] } } })).toBe(0);

    // Described in the file, the same subject is welcome.
    const described = await importer.import({
      subjects: [{ slug: typo, name: 'Spec Typo', group: 'clinical' }],
      questions: [input.questions[0]],
    });
    expect(described).toMatchObject({ created: 1 });
    await prisma.question.deleteMany({ where: { externalKey: `spec-${run}-typo` } });
    await prisma.subject.deleteMany({ where: { slug: typo } });
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
    const started = await practice.start(user.id, {
      mode: PracticeMode.TEST,
      filters,
      count: 4,
      timeLimitSec: 600,
    });
    const session = await practice.begin(user.id, started.id);
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
    // A free user's review explains what they answered; the two left blank
    // stay locked (the subscriber case is in "production hardening").
    const explained = new Set(review.questions.filter((q) => 'explanation' in q).map((q) => q.id));
    expect(explained).toEqual(new Set([q1.id, q2.id]));
    expect(review.lockedAnswers).toBe(2);
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
          metadata: { [PYQ_PLAN_KEY]: true },
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

describe('search, sort and session ordering', () => {
  it('searches stems case-insensitively and sorts by exam year', async () => {
    const user = await createUser();
    const hit = await bank.list(user.id, { ...filters, search: 'question 3' }, 1, 50);
    expect(hit.items.map((q) => q.stem)).toEqual([expect.stringMatching(/^Question 3/)]);

    const oldest = await bank.list(user.id, filters, 1, 50, 'oldest-exam-year');
    expect(oldest.items.map((q) => q.year)).toEqual([2020, 2020, 2020, 2021, 2021]);
    const newest = await bank.list(user.id, filters, 1, 50, 'newest-exam-year');
    expect(newest.items[0].year).toBe(2021);
  });

  it('draws the priority group first, then fills the rest', async () => {
    const user = await createUser();
    const rows = await questionIds();
    await progress.addBookmark(user.id, rows[4].id);

    const session = await practice.start(user.id, {
      mode: PracticeMode.PRACTICE,
      filters,
      count: 5,
      order: 'bookmarked-first',
    });
    expect(session.questions).toHaveLength(5);
    expect(session.questions[0].id).toBe(rows[4].id);

    const wrong = rows[2];
    const first = await practice.start(user.id, { mode: PracticeMode.PRACTICE, questionIds: [wrong.id] });
    await practice.answer(user.id, first.id, {
      questionId: wrong.id,
      selectedOptionId: wrong.options[1].id,
    });
    const retry = await practice.start(user.id, {
      mode: PracticeMode.PRACTICE,
      filters,
      count: 2,
      order: 'incorrect-first',
    });
    expect(retry.questions[0].id).toBe(wrong.id);

    const fresh = await practice.start(user.id, {
      mode: PracticeMode.PRACTICE,
      filters,
      count: 4,
      order: 'unattempted-first',
    });
    expect(fresh.questions.map((q) => q.id)).not.toContain(wrong.id);
  });

  it('describes history from the questions and gives the bookmark status', async () => {
    const user = await createUser();
    const rows = await questionIds();
    const session = await practice.start(user.id, {
      mode: PracticeMode.PRACTICE,
      questionIds: [rows[0].id, rows[1].id],
    });
    await practice.answer(user.id, session.id, {
      questionId: rows[0].id,
      selectedOptionId: rows[0].options[1].id,
    });

    const [item] = (await practice.history(user.id, 1, 10)).items;
    expect(item).toMatchObject({
      examIds: [EXAM],
      subjectIds: [SUBJECT],
      newestYear: 2021,
      oldestYear: 2020,
      resumeIndex: 1,
    });
    expect(item.lastWrongAt).toBeInstanceOf(Date);

    await progress.addBookmark(user.id, rows[0].id);
    const [bookmark] = await progress.listBookmarks(user.id);
    expect(bookmark.userStatus).toBe('incorrect');
  });
});

describe('read models', () => {
  it('stay exact under repeated refreshes, flags and an unsubmitted test', async () => {
    const user = await createUser();
    const rows = await questionIds();
    const practiceRun = await practice.start(user.id, { mode: PracticeMode.PRACTICE, questionIds: [rows[0].id] });
    await practice.answer(user.id, practiceRun.id, { questionId: rows[0].id, selectedOptionId: rows[0].options[0].id });
    await states.refresh(user.id, [rows[0].id]);
    await states.refresh(user.id, [rows[0].id]);
    expect(
      await prisma.userQuestionState.findUnique({
        where: { userId_questionId: { userId: user.id, questionId: rows[0].id } },
      }),
    ).toMatchObject({ latestCorrect: true, attemptCount: 1, incorrectCount: 0 });

    // A flag set and cleared with no answer behind it leaves nothing.
    const flagRun = await practice.start(user.id, { mode: PracticeMode.PRACTICE, questionIds: [rows[1].id] });
    await practice.flag(user.id, flagRun.id, rows[1].id, true);
    await practice.flag(user.id, flagRun.id, rows[1].id, false);
    expect(
      await prisma.userQuestionState.count({ where: { userId: user.id, questionId: rows[1].id } }),
    ).toBe(0);

    // A running test's wrong answer is invisible until submit.
    const test = await practice.begin(
      user.id,
      (await practice.start(user.id, { mode: PracticeMode.TEST, questionIds: [rows[2].id] })).id,
    );
    await practice.answer(user.id, test.id, { questionId: rows[2].id, selectedOptionId: rows[2].options[1].id });
    expect((await bank.list(user.id, { ...filters, status: 'incorrect' }, 1, 50)).total).toBe(0);
    expect((await practice.history(user.id, 1, 10, 'IN_PROGRESS')).items.map((s) => s.id)).toContain(test.id);
    await practice.submit(user.id, test.id);
    expect((await bank.list(user.id, { ...filters, status: 'incorrect' }, 1, 50)).total).toBe(1);
    expect((await practice.history(user.id, 1, 10, 'SUBMITTED')).items.map((s) => s.id)).toContain(test.id);

    const stats = await progress.stats(user.id);
    expect(stats).toMatchObject({ attempted: 2, correct: 1, incorrect: 1 });
  });
});

describe('production hardening', () => {
  async function grantPlan(userId: string) {
    const plan = await prisma.product.create({
      data: {
        slug: `pyq-spec-plan-${randomUUID()}`,
        title: 'PYQ Pro',
        type: ProductType.COURSE,
        status: ProductStatus.PUBLISHED,
        accessType: AccessType.PAID,
        priceAmountMinor: 49900n,
        metadata: { [PYQ_PLAN_KEY]: true },
      },
    });
    created.productIds.push(plan.id);
    await entitlements.grant({ userId, productId: plan.id, source: EntitlementSource.ADMIN_GRANT });
  }
  const field = (question: object, key: string) => (question as Record<string, unknown>)[key];

  it('a free review reveals only what was answered; a subscriber sees every answer', async () => {
    const user = await createUser();
    const rows = await questionIds();
    const session = await practice.start(user.id, {
      mode: PracticeMode.PRACTICE,
      questionIds: rows.slice(0, 3).map((row) => row.id),
    });
    await practice.answer(user.id, session.id, { questionId: rows[0].id, selectedOptionId: rows[0].options[0].id });

    const free = await practice.submit(user.id, session.id);
    expect(free.lockedAnswers).toBe(2);
    const byId = new Map(free.questions.map((q) => [q.id, q]));
    expect(field(byId.get(rows[0].id)!, 'correctOptionId')).toBe(rows[0].options[0].id);
    expect(field(byId.get(rows[1].id)!, 'correctOptionId')).toBeUndefined();
    expect(field(byId.get(rows[1].id)!, 'explanation')).toBeUndefined();

    await grantPlan(user.id);
    const paid = await practice.review(user.id, session.id);
    expect(paid.lockedAnswers).toBe(0);
    expect(paid.questions.every((q) => typeof field(q, 'correctOptionId') === 'string')).toBe(true);
  });

  it('holds the free allowance exactly when answers arrive in parallel', async () => {
    freeDaily = 2;
    try {
      const user = await createUser();
      const rows = await questionIds();
      const session = await practice.start(user.id, { mode: PracticeMode.PRACTICE, questionIds: rows.map((row) => row.id) });
      const results = await Promise.allSettled(
        rows.map((row) => practice.answer(user.id, session.id, { questionId: row.id, selectedOptionId: row.options[0].id })),
      );
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
      expect(
        results.filter((result) => result.status === 'rejected').every((result) => (result as PromiseRejectedResult).reason instanceof ForbiddenException),
      ).toBe(true);
      expect(await prisma.attempt.count({ where: { userId: user.id, answeredAt: { not: null } } })).toBe(2);
      // The day's count behind the streak saw both, despite the race.
      expect(await prisma.userDailyActivity.findFirst({ where: { userId: user.id } })).toMatchObject({ answered: 2 });
    } finally {
      freeDaily = 1000;
    }
  });

  it('refuses to submit a test that was never begun', async () => {
    const user = await createUser();
    const rows = await questionIds();
    const test = await practice.start(user.id, { mode: PracticeMode.TEST, questionIds: [rows[0].id] });
    await expect(practice.submit(user.id, test.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.practiceSession.findUnique({ where: { id: test.id } })).toMatchObject({ status: 'IN_PROGRESS' });
  });

  it('a flag left in a submitted test clears when the question is next practised', async () => {
    const user = await createUser();
    const rows = await questionIds();
    const state = () =>
      prisma.userQuestionState.findUnique({ where: { userId_questionId: { userId: user.id, questionId: rows[3].id } } });

    const test = await practice.begin(user.id, (await practice.start(user.id, { mode: PracticeMode.TEST, questionIds: [rows[3].id] })).id);
    await practice.flag(user.id, test.id, rows[3].id, true);
    await practice.submit(user.id, test.id);
    expect(await state()).toMatchObject({ flagged: true });

    const later = await practice.start(user.id, { mode: PracticeMode.PRACTICE, questionIds: [rows[3].id] });
    await practice.answer(user.id, later.id, { questionId: rows[3].id, selectedOptionId: rows[3].options[0].id });
    expect(await state()).toMatchObject({ flagged: false, latestCorrect: true });
  });

  it('accepts an answer to a question left open overnight, counting at most 6 hours', async () => {
    const user = await createUser();
    const rows = await questionIds();
    const session = await practice.start(user.id, { mode: PracticeMode.PRACTICE, questionIds: [rows[4].id] });
    await practice.answer(user.id, session.id, {
      questionId: rows[4].id,
      selectedOptionId: rows[4].options[0].id,
      timeSpentMs: 30 * 3600 * 1000,
    });
    expect(
      await prisma.attempt.findUnique({ where: { sessionId_questionId: { sessionId: session.id, questionId: rows[4].id } } }),
    ).toMatchObject({ timeSpentMs: 6 * 3600 * 1000 });
  });
});

describe('exam papers (session month)', () => {
  const key = (i: number) => `${PAPER_KEY_PREFIX}${i}`;
  /** `undefined` leaves sessionMonth out of the file. */
  function paperInput(months: (number | null | undefined)[]): ImportInput {
    return {
      subjects: [{ slug: PAPER_SUBJECT, name: 'Spec Papers', group: 'clinical' }],
      questions: months.map((sessionMonth, i) => ({
        externalKey: key(i),
        examSlug: EXAM,
        subjectSlug: PAPER_SUBJECT,
        year: PAPER_YEAR,
        ...(sessionMonth === undefined ? {} : { sessionMonth }),
        stem: `Paper question ${i}`,
        explanation: 'Because',
        difficulty: Difficulty.EASY,
        status: QuestionStatus.PUBLISHED,
        options: ['A', 'B'].map((text, j) => ({ text, isCorrect: j === 0 })),
      })),
    };
  }
  const months = async () =>
    (
      await prisma.question.findMany({
        where: { externalKey: { startsWith: PAPER_KEY_PREFIX } },
        orderBy: { externalKey: 'asc' },
        select: { sessionMonth: true },
      })
    ).map((row) => row.sessionMonth);

  it('imports the month, keeps it when a later file leaves it out, and clears it on null', async () => {
    await importer.import(paperInput([6, 12, null]));
    expect(await months()).toEqual([6, 12, null]);

    await importer.import(paperInput([undefined, undefined, undefined]));
    expect(await months()).toEqual([6, 12, null]);

    await importer.import(paperInput([6, null, 12]));
    expect(await months()).toEqual([6, null, 12]);

    await importer.import(paperInput([6, 12, null]));
    expect(await months()).toEqual([6, 12, null]);
  });

  it('counts each paper in the taxonomy, filters by paper, and sorts the later session first', async () => {
    // The import endpoint drops the cached taxonomy (InvalidateTaxonomyInterceptor); do the same.
    await bank.invalidateTaxonomy();
    const taxonomy = await bank.taxonomy();
    expect(taxonomy.papers.filter((paper) => paper.year === PAPER_YEAR)).toEqual([
      { key: `${PAPER_YEAR}-12`, year: PAPER_YEAR, month: 12, questionCount: 1 },
      { key: `${PAPER_YEAR}-06`, year: PAPER_YEAR, month: 6, questionCount: 1 },
      { key: `${PAPER_YEAR}`, year: PAPER_YEAR, month: null, questionCount: 1 },
    ]);
    // Older app versions still get the year, counting every session in it.
    expect(taxonomy.years.find((row) => row.year === PAPER_YEAR)).toEqual({ year: PAPER_YEAR, questionCount: 3 });

    const user = await createUser();
    const keysFor = async (query: { papers?: string[]; years?: number[] }) =>
      (await bank.list(user.id, { subjectIds: [PAPER_SUBJECT], ...query }, 1, 50)).items.map((item) => item.externalKey).sort();
    expect(await keysFor({ papers: [`${PAPER_YEAR}-06`] })).toEqual([key(0)]);
    expect(await keysFor({ papers: [`${PAPER_YEAR}-12`] })).toEqual([key(1)]);
    expect(await keysFor({ papers: [`${PAPER_YEAR}-06`, `${PAPER_YEAR}`] })).toEqual([key(0), key(2)]);
    expect(await keysFor({ years: [PAPER_YEAR] })).toEqual([key(0), key(1), key(2)]);

    const newestFirst = await bank.list(user.id, { subjectIds: [PAPER_SUBJECT] }, 1, 50, 'newest-exam-year');
    expect(newestFirst.items.map((item) => item.sessionMonth)).toEqual([12, 6, null]);

    // A session drawn for one paper only ever contains that paper's questions.
    const session = await practice.start(user.id, {
      mode: PracticeMode.PRACTICE,
      filters: { subjectIds: [PAPER_SUBJECT], papers: [`${PAPER_YEAR}-12`] },
      count: 5,
    });
    const detail = await practice.get(user.id, session.id);
    expect(detail.questions.map((question) => question.sessionMonth)).toEqual([12]);
  });
});

describe('explanation parts (pearls, quick revision, why each option)', () => {
  const key = `${PARTS_KEY_PREFIX}0`;
  function partsInput(parts: { pearls?: string[]; quickRevision?: string | null; why?: boolean } = {}): ImportInput {
    const why = parts.why ?? true;
    return {
      subjects: [{ slug: PARTS_SUBJECT, name: 'Spec Parts', group: 'clinical' }],
      questions: [
        {
          externalKey: key,
          examSlug: EXAM,
          subjectSlug: PARTS_SUBJECT,
          year: 2024,
          stem: 'Which nerve is injured in a fibular neck fracture?',
          explanation: 'The common peroneal nerve winds round the fibular neck.',
          ...(parts.pearls !== undefined ? { pearls: parts.pearls } : {}),
          ...(parts.quickRevision !== undefined ? { quickRevision: parts.quickRevision } : {}),
          difficulty: Difficulty.EASY,
          status: QuestionStatus.PUBLISHED,
          options: [
            { text: 'Common peroneal nerve', isCorrect: true },
            { text: 'Tibial nerve', isCorrect: false, ...(why ? { explanation: 'Plantarflexion, not dorsiflexion.' } : {}) },
            { text: 'Deep peroneal nerve', isCorrect: false, ...(why ? { explanation: 'Spares eversion.' } : {}) },
          ],
        },
      ],
    };
  }
  const row = () =>
    prisma.question.findUniqueOrThrow({
      where: { externalKey: key },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });

  it('imports them, keeps them when a later file leaves them out, and clears them on [] / null', async () => {
    await importer.import(partsInput({ pearls: ['  Fibular neck → common peroneal ', '', 'Foot drop'], quickRevision: 'Deep = dorsiflexion.' }));
    let saved = await row();
    expect(saved.pearls).toEqual(['Fibular neck → common peroneal', 'Foot drop']);
    expect(saved.quickRevision).toBe('Deep = dorsiflexion.');
    expect(saved.options.map((option) => option.explanation)).toEqual([null, 'Plantarflexion, not dorsiflexion.', 'Spares eversion.']);

    await importer.import(partsInput({ why: false }));
    saved = await row();
    expect(saved.pearls).toHaveLength(2);
    expect(saved.quickRevision).toBe('Deep = dorsiflexion.');
    expect(saved.options[1].explanation).toBe('Plantarflexion, not dorsiflexion.');

    await importer.import(partsInput({ pearls: [], quickRevision: null }));
    saved = await row();
    expect(saved.pearls).toEqual([]);
    expect(saved.quickRevision).toBeNull();

    await importer.import(partsInput({ pearls: ['Foot drop'], quickRevision: 'Deep = dorsiflexion.' }));
  });

  it('are revealed with the answer in practice, never before, and never in a running test', async () => {
    const user = await createUser();
    const question = await row();
    const [right, wrong, other] = question.options;
    const hidden = (view: Record<string, unknown>) =>
      !('pearls' in view) && !('quickRevision' in view) && !('optionExplanations' in view) && !('explanation' in view);

    const practiceSession = await practice.start(user.id, { mode: PracticeMode.PRACTICE, questionIds: [question.id] });
    expect(hidden((await practice.get(user.id, practiceSession.id)).questions[0] as never)).toBe(true);

    const answer = await practice.answer(user.id, practiceSession.id, { questionId: question.id, selectedOptionId: wrong.id });
    expect(answer).toMatchObject({
      isCorrect: false,
      correctOptionId: right.id,
      pearls: ['Foot drop'],
      quickRevision: 'Deep = dorsiflexion.',
      optionExplanations: { [wrong.id]: 'Plantarflexion, not dorsiflexion.', [other.id]: 'Spares eversion.' },
    });
    const revealed = (await practice.get(user.id, practiceSession.id)).questions[0] as unknown as Record<string, unknown>;
    expect(revealed).toMatchObject({ pearls: ['Foot drop'], quickRevision: 'Deep = dorsiflexion.' });
    // Keyed by option id: no entry for an option without its own "why".
    expect(Object.keys(revealed.optionExplanations as object).sort()).toEqual([wrong.id, other.id].sort());

    const test = await practice.begin(user.id, (await practice.start(user.id, { mode: PracticeMode.TEST, questionIds: [question.id], timeLimitSec: 600 })).id);
    const recorded = await practice.answer(user.id, test.id, { questionId: question.id, selectedOptionId: wrong.id });
    expect(hidden(recorded as never)).toBe(true);
    expect(hidden((await practice.get(user.id, test.id)).questions[0] as never)).toBe(true);
  });

  it('sends uploaded images by the same rule: the question image with the question, the explanation image only with the answer', async () => {
    const signed = (objectKey: string) => `https://signed.test/${objectKey}`;
    const signing = new PracticeService(
      prisma,
      bank,
      access,
      states,
      examSetup,
      new QuestionImageLinks(
        { getSignedDownloadUrl: async (ref: { objectKey: string }) => signed(ref.objectKey) } as never,
        { get: () => 3600 } as never,
      ),
    );
    const question = await row();
    const files = { stem: `pyq/questions/${question.id}/stem.png`, why: `pyq/questions/${question.id}/why.png` };
    const none = {
      stemImageStorageProvider: null,
      stemImageBucket: null,
      stemImageObjectKey: null,
      explanationImageStorageProvider: null,
      explanationImageBucket: null,
      explanationImageObjectKey: null,
    };
    await prisma.question.update({
      where: { id: question.id },
      data: {
        stemImageStorageProvider: 'LOCAL',
        stemImageBucket: 'private',
        stemImageObjectKey: files.stem,
        explanationImageStorageProvider: 'LOCAL',
        explanationImageBucket: 'private',
        explanationImageObjectKey: files.why,
      },
    });
    try {
      const user = await createUser();
      const session = await signing.start(user.id, { mode: PracticeMode.PRACTICE, questionIds: [question.id] });
      const before = (await signing.get(user.id, session.id)).questions[0] as unknown as Record<string, unknown>;
      expect(before.stemImageUrl).toBe(signed(files.stem));
      expect('explanationImageUrl' in before).toBe(false);

      const answer = await signing.answer(user.id, session.id, { questionId: question.id, selectedOptionId: question.options[0].id });
      expect(answer).toMatchObject({ explanationImageUrl: signed(files.why) });
      expect((await signing.get(user.id, session.id)).questions[0]).toMatchObject({
        stemImageUrl: signed(files.stem),
        explanationImageUrl: signed(files.why),
      });

      const test = await signing.begin(
        user.id,
        (await signing.start(user.id, { mode: PracticeMode.TEST, questionIds: [question.id], timeLimitSec: 600 })).id,
      );
      const inTest = (await signing.get(user.id, test.id)).questions[0] as unknown as Record<string, unknown>;
      expect(inTest.stemImageUrl).toBe(signed(files.stem));
      expect('explanationImageUrl' in inTest).toBe(false);
    } finally {
      await prisma.question.update({ where: { id: question.id }, data: none });
    }
  });
});
