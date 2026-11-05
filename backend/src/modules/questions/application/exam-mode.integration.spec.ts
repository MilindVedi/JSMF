import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Difficulty, PracticeMode, QuestionStatus, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AuditService } from '../../../shared/audit/audit.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  marksFor,
  maxMarksFor,
  parseExamPattern,
  sectionWindows,
} from '../domain/exam-pattern';
import { optionOrderLock, optionSeed, seededOrder } from '../domain/option-order';
import { AdminExamSetupController } from '../http/admin-exam-setup.controller';
import { ExamSetupService } from './exam-setup.service';
import { PracticeService } from './practice.service';
import { PyqAccessService } from './pyq-access.service';
import { PyqSubscriptionService } from './pyq-subscription.service';
import { QuestionAdminService } from './question-admin.service';
import { QuestionBankService } from './question-bank.service';
import { QuestionImportService } from './question-import.service';
import { QuestionStateService } from './question-state.service';

/**
 * The exam side of practice against the dev Postgres: shuffled options (and
 * the questions that must never be shuffled), a test waiting on its
 * instructions screen, full mocks following an exam pattern with
 * time-bound sections, and exact marking. Rows live under a taxonomy slug
 * unique to this run and are deleted by id afterwards; the shared
 * practice-settings row is put back as it was.
 */
const config = {
  get(key: string) {
    if (key === 'PYQ_FREE_DAILY_QUESTIONS') return 1000;
    return process.env[key];
  },
} as never;
const passThroughCache = {
  wrap: (_key: string, _ttl: number, load: () => unknown) => load(),
  del: async () => {},
} as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const subscriptions = new PyqSubscriptionService(prisma, audit, passThroughCache, config);
const access = new PyqAccessService(prisma, config, subscriptions);
const bank = new QuestionBankService(prisma, new CacheService({ get: () => false } as never));
const states = new QuestionStateService(prisma);
const examSetup = new ExamSetupService(prisma, audit, passThroughCache);
const practice = new PracticeService(prisma, bank, access, states, examSetup);
const importer = new QuestionImportService(prisma);
const questionAdmin = new QuestionAdminService(prisma);

const run = randomUUID().slice(0, 8);
const EXAM = `mode-exam-${run}`;
const SUBJECT = `mode-subject-${run}`;
const userIds: string[] = [];
let admin: { id: string; ip: null };
let savedShuffle: boolean;

/** Two locked sections of three questions, a minute each, +4 / −1. */
const SMALL_PATTERN = {
  sections: [
    { name: 'Section A', questions: 3, minutes: 1 },
    { name: 'Section B', questions: 3, minutes: 1 },
  ],
  sectionsLocked: true,
  marking: { correct: { num: 4, den: 1 }, incorrect: { num: 1, den: 1 } },
};

async function newUser() {
  const user = await prisma.user.create({
    data: { email: `pyq-mode-spec-${randomUUID()}@jsmf.test`, name: 'Mode Spec', status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);
  return user.id;
}

function question(i: number, options: string[], explanation = `Because ${i}`) {
  return {
    externalKey: `mode-${run}-${i}`,
    examSlug: EXAM,
    subjectSlug: SUBJECT,
    year: 2024,
    stem: `Mode question ${i}`,
    explanation,
    difficulty: Difficulty.MEDIUM,
    status: QuestionStatus.PUBLISHED,
    options: options.map((text, j) => ({ text, isCorrect: j === 0 })),
  };
}

const PLAIN = ['Aorta', 'Vena cava', 'Pulmonary artery', 'Coronary sinus'];

async function rowsByKey() {
  const rows = await prisma.question.findMany({
    where: { externalKey: { startsWith: `mode-${run}-` } },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  });
  return new Map(rows.map((row) => [row.externalKey.split('-').pop()!, row]));
}

async function setShuffle(on: boolean) {
  await examSetup.updateSettings({ shuffleOptions: on }, admin);
}

/** Moves a running test's clock back, as if `seconds` had passed since it began. */
async function rewindClock(sessionId: string, seconds: number) {
  await prisma.practiceSession.update({
    where: { id: sessionId },
    data: { clockStartedAt: new Date(Date.now() - seconds * 1000) },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  admin = { id: await newUser(), ip: null };
  savedShuffle = (await examSetup.settings()).shuffleOptions;
  await importer.import({
    exams: [{ slug: EXAM, name: 'Mode Exam', shortName: 'MODE' }],
    subjects: [{ slug: SUBJECT, name: 'Mode Subject', group: 'clinical' }],
    questions: [
      question(0, PLAIN),
      question(1, PLAIN),
      question(2, PLAIN),
      question(3, PLAIN),
      question(4, PLAIN),
      question(5, ['Heart', 'Lung', 'Liver', 'All of the above']),
    ],
  });
});

afterAll(async () => {
  await setShuffle(savedShuffle);
  await prisma.practiceSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.question.deleteMany({ where: { externalKey: { startsWith: `mode-${run}-` } } });
  await prisma.subject.deleteMany({ where: { slug: SUBJECT } });
  await prisma.exam.deleteMany({ where: { slug: EXAM } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: admin.id } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

// --- Pure rules ---------------------------------------------------------------------

describe('option order', () => {
  it('is a stable permutation per seed, and differs between seeds', () => {
    const items = ['a', 'b', 'c', 'd'];
    const first = seededOrder(items, optionSeed('s1', 'q1'));
    expect(seededOrder(items, optionSeed('s1', 'q1'))).toEqual(first);
    expect([...first].sort()).toEqual(items);
    const orders = new Set(Array.from({ length: 40 }, (_, i) => seededOrder(items, `seed-${i}`).join('')));
    expect(orders.size).toBeGreaterThan(10);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps questions whose options or explanation refer to other options', () => {
    const lock = (options: string[], explanation = 'Plain.', keepOptionOrder = false) =>
      optionOrderLock({ keepOptionOrder, explanation, options: options.map((text) => ({ text })) })?.reason ?? null;

    expect(lock(['x', 'y', 'z', 'All of the above'])).toBe('options-refer-to-options');
    expect(lock(['x', 'y', 'None of these', 'z'])).toBe('options-refer-to-options');
    expect(lock(['x', 'y', 'Both A and C', 'z'])).toBe('options-refer-to-options');
    expect(lock(['x', 'y', 'B & D', 'z'])).toBe('options-refer-to-options');
    expect(lock(['x', 'y', 'z', 'w'], 'Option B is wrong because…')).toBe('explanation-names-options');
    expect(lock(['x', 'y', 'z', 'w'], 'Plain.', true)).toBe('admin');

    // Letters that are part of a name are not references.
    expect(lock(['Hepatitis B', 'Vitamin A', 'Type C fibres', 'Grade D'])).toBeNull();
    expect(lock(['x', 'y', 'z', 'w'], 'Vitamin A deficiency causes night blindness.')).toBeNull();
  });
});

describe('exam pattern', () => {
  it('normalises a valid pattern and refuses broken ones', () => {
    const parsed = parseExamPattern({
      ...SMALL_PATTERN,
      sections: [{ name: '  Only   section ', questions: 5, minutes: 10 }],
      marking: { correct: { num: 2, den: 2 }, incorrect: { num: 2, den: 6 } },
    });
    expect(parsed.sections[0].name).toBe('Only section');
    expect(parsed.sectionsLocked).toBe(false); // one section has nothing to lock against
    expect(parsed.marking).toEqual({ correct: { num: 1, den: 1 }, incorrect: { num: 1, den: 3 } });

    const broken = [
      { ...SMALL_PATTERN, sections: [] },
      { ...SMALL_PATTERN, sections: [{ name: 'A', questions: 3, minutes: 1 }, { name: 'a', questions: 3, minutes: 1 }] },
      { ...SMALL_PATTERN, sections: [{ name: 'A', questions: 301, minutes: 10 }] },
      { ...SMALL_PATTERN, sections: [{ name: 'A', questions: 3, minutes: 0 }] },
      { ...SMALL_PATTERN, marking: { correct: { num: 0, den: 1 }, incorrect: { num: 0, den: 1 } } },
      { ...SMALL_PATTERN, marking: { correct: { num: 1, den: 0 }, incorrect: { num: 0, den: 1 } } },
      { ...SMALL_PATTERN, version: 9 },
    ];
    for (const pattern of broken) expect(() => parseExamPattern(pattern)).toThrow();
  });

  it('marks exactly, rounding only at the end', () => {
    const iniCet = parseExamPattern({
      sections: [{ name: 'Paper', questions: 200, minutes: 180 }],
      sectionsLocked: false,
      marking: { correct: { num: 1, den: 1 }, incorrect: { num: 1, den: 3 } },
    });
    expect(marksFor(iniCet, 0, 200)).toBe(-66.67);
    expect(marksFor(iniCet, 150, 30)).toBe(140);
    expect(maxMarksFor(iniCet)).toBe(200);

    const neetPg = parseExamPattern({
      sections: Array.from({ length: 5 }, (_, i) => ({ name: `Section ${'ABCDE'[i]}`, questions: 36, minutes: 42 })),
      sectionsLocked: true,
      marking: { correct: { num: 4, den: 1 }, incorrect: { num: 1, den: 1 } },
    });
    expect(marksFor(neetPg, 150, 30)).toBe(570);
    expect(maxMarksFor(neetPg)).toBe(720);
  });

  it('opens locked sections one after another, and unlocked ones together', () => {
    const start = new Date('2026-01-01T09:00:00Z');
    const locked = sectionWindows(parseExamPattern(SMALL_PATTERN), start);
    expect(locked.map((w) => [w.firstPosition, w.opensAt.toISOString(), w.closesAt.toISOString()])).toEqual([
      [0, '2026-01-01T09:00:00.000Z', '2026-01-01T09:01:00.000Z'],
      [3, '2026-01-01T09:01:00.000Z', '2026-01-01T09:02:00.000Z'],
    ]);
    const open = sectionWindows(parseExamPattern({ ...SMALL_PATTERN, sectionsLocked: false }), start);
    expect(open.every((w) => w.closesAt.toISOString() === '2026-01-01T09:02:00.000Z')).toBe(true);
  });
});

// --- Against the database ---------------------------------------------------------------

describe('shuffled options', () => {
  it('shows each session its own stable order, relabelled by position, never for locked questions', async () => {
    await setShuffle(true);
    const rows = await rowsByKey();
    const user = await newUser();
    const ids = ['0', '1', '2', '3', '4', '5'].map((k) => rows.get(k)!.id);

    const orders = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      const session = await practice.start(user, { mode: PracticeMode.PRACTICE, questionIds: ids });
      const again = await practice.get(user, session.id);
      expect(again.questions).toEqual(session.questions);
      for (const q of session.questions) {
        expect(q.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
        const written = rows.get(q.externalKey.split('-').pop()!)!.options.map((o) => o.id);
        expect([...q.options.map((o) => o.id)].sort()).toEqual([...written].sort());
      }
      // "All of the above" stays where it was written, in every session.
      const locked = session.questions.find((q) => q.externalKey.endsWith('-5'))!;
      expect(locked.options.map((o) => o.text)).toEqual(['Heart', 'Lung', 'Liver', 'All of the above']);
      orders.add(session.questions.filter((q) => !q.externalKey.endsWith('-5')).map((q) => q.options.map((o) => o.id).join()).join('|'));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('answers by option id, so a shuffled correct answer is still scored right', async () => {
    await setShuffle(true);
    const rows = await rowsByKey();
    const user = await newUser();
    const session = await practice.start(user, { mode: PracticeMode.PRACTICE, questionIds: [rows.get('0')!.id] });
    const correct = rows.get('0')!.options.find((o) => o.isCorrect)!;
    const result = await practice.answer(user, session.id, { questionId: rows.get('0')!.id, selectedOptionId: correct.id });
    expect(result).toMatchObject({ isCorrect: true, correctOptionId: correct.id });
  });

  it('keeps the written order when admin says so, or when shuffling is off', async () => {
    const rows = await rowsByKey();
    const user = await newUser();
    const target = rows.get('1')!;
    await questionAdmin.update(target.id, { keepOptionOrder: true }, admin.id);
    expect((await questionAdmin.get(target.id)).optionOrderLock).toEqual({ reason: 'admin' });
    await setShuffle(true);
    for (let i = 0; i < 4; i += 1) {
      const session = await practice.start(user, { mode: PracticeMode.PRACTICE, questionIds: [target.id] });
      expect(session.questions[0].options.map((o) => o.id)).toEqual(target.options.map((o) => o.id));
    }
    await questionAdmin.update(target.id, { keepOptionOrder: false }, admin.id);

    await setShuffle(false);
    const plain = await practice.start(user, { mode: PracticeMode.PRACTICE, questionIds: [rows.get('2')!.id] });
    expect(plain.questions[0].options.map((o) => o.id)).toEqual(rows.get('2')!.options.map((o) => o.id));
    // The decision is the session's: turning shuffling on later changes nothing for it.
    await setShuffle(true);
    const later = await practice.get(user, plain.id);
    expect(later.questions[0].options.map((o) => o.id)).toEqual(rows.get('2')!.options.map((o) => o.id));
  });
});

describe('a test waits for its instructions screen', () => {
  it('withholds questions and refuses answers until begun; beginning is idempotent', async () => {
    const rows = await rowsByKey();
    const user = await newUser();
    const started = await practice.start(user, {
      mode: PracticeMode.TEST,
      questionIds: [rows.get('0')!.id, rows.get('1')!.id],
      timeLimitSec: 600,
    });
    expect(started.clockStartedAt).toBeNull();
    expect(started.questions).toEqual([]);
    expect(started.totalQuestions).toBe(2);
    await expect(
      practice.answer(user, started.id, { questionId: rows.get('0')!.id, selectedOptionId: rows.get('0')!.options[0].id }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(practice.flag(user, started.id, rows.get('0')!.id, true)).rejects.toBeInstanceOf(ConflictException);

    const begun = await practice.begin(user, started.id);
    expect(begun.clockStartedAt).toBeInstanceOf(Date);
    expect(begun.questions).toHaveLength(2);
    const again = await practice.begin(user, started.id);
    expect(again.clockStartedAt).toEqual(begun.clockStartedAt);

    // Practice needs no instructions screen.
    const practiceRun = await practice.start(user, { mode: PracticeMode.PRACTICE, questionIds: [rows.get('0')!.id] });
    expect(practiceRun.clockStartedAt).toBeInstanceOf(Date);
    expect(practiceRun.questions).toHaveLength(1);
  });

  it('never lets a client pose as a mock or send "Save & exit" off the site', async () => {
    const rows = await rowsByKey();
    const user = await newUser();
    const session = await practice.start(user, {
      mode: PracticeMode.PRACTICE,
      questionIds: [rows.get('0')!.id],
      meta: { uiMode: 'full-mock', sourceHref: '//evil.example/phish', note: 'kept' },
    });
    expect(session.config).toMatchObject({ note: 'kept' });
    expect(session.config).not.toHaveProperty('uiMode');
    expect(session.config).not.toHaveProperty('sourceHref');
    expect(session.pattern).toBeNull();

    const good = await practice.start(user, {
      mode: PracticeMode.PRACTICE,
      questionIds: [rows.get('0')!.id],
      meta: { uiMode: 'custom-test', sourceHref: '/question-bank?exam=neet-pg' },
    });
    expect(good.config).toMatchObject({ uiMode: 'custom-test', sourceHref: '/question-bank?exam=neet-pg' });
  });
});

describe('full mocks', () => {
  it('are offered only while enabled and fillable', async () => {
    await examSetup.savePattern(EXAM, { enabled: false, pattern: SMALL_PATTERN }, admin);
    expect((await examSetup.mockOffers()).map((m) => m.examId)).not.toContain(EXAM);
    await expect(practice.startMock(await newUser(), { examId: EXAM })).rejects.toBeInstanceOf(ConflictException);

    // Seven questions needed, six in the bank.
    await examSetup.savePattern(
      EXAM,
      { enabled: true, pattern: { ...SMALL_PATTERN, sections: [...SMALL_PATTERN.sections, { name: 'Section C', questions: 1, minutes: 1 }] } },
      admin,
    );
    expect((await examSetup.mockOffers()).map((m) => m.examId)).not.toContain(EXAM);
    await expect(practice.startMock(await newUser(), { examId: EXAM })).rejects.toBeInstanceOf(ConflictException);

    await examSetup.savePattern(EXAM, { enabled: true, pattern: SMALL_PATTERN }, admin);
    const offer = (await examSetup.mockOffers()).find((m) => m.examId === EXAM);
    expect(offer).toMatchObject({ totalQuestions: 6, totalMinutes: 2, shortName: 'MODE' });

    const overview = await examSetup.adminOverview();
    expect(overview.exams.find((e) => e.examId === EXAM)).toMatchObject({ enabled: true, publishedQuestions: 6 });
    const audited = await prisma.auditLog.count({ where: { actorUserId: admin.id, action: 'pyq.exam_pattern_saved' } });
    expect(audited).toBeGreaterThanOrEqual(3);
  });

  it('refuses an invalid pattern with a message for the admin', async () => {
    await expect(
      examSetup.savePattern(EXAM, { enabled: true, pattern: { ...SMALL_PATTERN, sections: [] } }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('runs its sections one after another, enforced by the server, and scores with its marking', async () => {
    await examSetup.savePattern(EXAM, { enabled: true, pattern: SMALL_PATTERN }, admin);
    const user = await newUser();
    const created = await practice.startMock(user, { examId: EXAM, sourceHref: '/custom-test/new' });
    expect(created).toMatchObject({
      mode: PracticeMode.TEST,
      label: 'MODE Full Mock',
      timeLimitSec: 120,
      totalQuestions: 6,
      clockStartedAt: null,
      config: { uiMode: 'full-mock', examId: EXAM, sourceHref: '/custom-test/new' },
    });
    expect(created.pattern?.sections.map((s) => s.name)).toEqual(['Section A', 'Section B']);

    const mock = await practice.begin(user, created.id);
    expect(mock.sectionWindows?.map((w) => w.firstPosition)).toEqual([0, 3]);
    const rows = await rowsByKey();
    const byId = new Map([...rows.values()].map((row) => [row.id, row]));
    const right = (q: { id: string }) => byId.get(q.id)!.options.find((o) => o.isCorrect)!.id;
    const wrong = (q: { id: string }) => byId.get(q.id)!.options.find((o) => !o.isCorrect)!.id;
    const [a1, a2, , b1, b2] = mock.questions;

    // Section A is open; B is not yet.
    await practice.answer(user, mock.id, { questionId: a1.id, selectedOptionId: right(a1) });
    await expect(practice.answer(user, mock.id, { questionId: b1.id, selectedOptionId: right(b1) })).rejects.toMatchObject({
      response: { code: 'PYQ_SECTION_NOT_OPEN' },
    });
    await expect(practice.flag(user, mock.id, b1.id, true)).rejects.toMatchObject({ response: { code: 'PYQ_SECTION_NOT_OPEN' } });

    // 95 s in: A closed for good (60 s + 30 s grace), B open.
    await rewindClock(mock.id, 95);
    await expect(practice.answer(user, mock.id, { questionId: a2.id, selectedOptionId: right(a2) })).rejects.toMatchObject({
      response: { code: 'PYQ_SECTION_CLOSED' },
    });
    await practice.answer(user, mock.id, { questionId: b1.id, selectedOptionId: wrong(b1) });
    await practice.answer(user, mock.id, { questionId: b2.id, selectedOptionId: right(b2) });

    // Editing the pattern now changes nothing for this mock.
    await examSetup.savePattern(
      EXAM,
      { enabled: true, pattern: { ...SMALL_PATTERN, marking: { correct: { num: 1, den: 1 }, incorrect: { num: 0, den: 1 } } } },
      admin,
    );

    const during = await practice.get(user, mock.id);
    expect(during).not.toHaveProperty('marks');
    expect(JSON.stringify(during)).not.toContain('correctOptionId');

    const review = await practice.submit(user, mock.id);
    // A: 1 right. B: 1 wrong, 1 right. 2 × 4 − 1 = 7 of 24.
    expect(review).toMatchObject({ correct: 2, incorrect: 1, unattempted: 3, marks: { scored: 7, max: 24 } });
    const history = await practice.history(user, 1, 10);
    expect(history.items.find((s) => s.id === mock.id)).toMatchObject({ marks: { scored: 7, max: 24 } });
  });

  it('refuses every answer once the whole paper is over', async () => {
    await examSetup.savePattern(EXAM, { enabled: true, pattern: SMALL_PATTERN }, admin);
    const user = await newUser();
    const mock = await practice.begin(user, (await practice.startMock(user, { examId: EXAM })).id);
    await rewindClock(mock.id, 160);
    const last = mock.questions[5];
    await expect(
      practice.answer(user, mock.id, { questionId: last.id, selectedOptionId: last.options[0].id }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets an unlocked paper be answered in any order', async () => {
    await examSetup.savePattern(EXAM, { enabled: true, pattern: { ...SMALL_PATTERN, sectionsLocked: false } }, admin);
    const user = await newUser();
    const mock = await practice.begin(user, (await practice.startMock(user, { examId: EXAM })).id);
    const last = mock.questions[5];
    await practice.answer(user, mock.id, { questionId: last.id, selectedOptionId: last.options[0].id });
    const first = mock.questions[0];
    await practice.answer(user, mock.id, { questionId: first.id, selectedOptionId: first.options[0].id });
  });
});

describe('roles', () => {
  it('lets only admins reach exam setup', () => {
    const guard = new RolesGuard(new Reflector());
    const contextFor = (handler: string, roles: string[]) =>
      ({
        getClass: () => AdminExamSetupController,
        getHandler: () => (AdminExamSetupController.prototype as unknown as Record<string, unknown>)[handler],
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', roles } }) }),
      }) as unknown as ExecutionContext;

    for (const handler of ['overview', 'updateSettings', 'savePattern']) {
      expect(guard.canActivate(contextFor(handler, ['ADMIN']))).toBe(true);
      expect(() => guard.canActivate(contextFor(handler, ['EDUCATOR']))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(contextFor(handler, ['USER']))).toThrow(ForbiddenException);
    }
  });
});
