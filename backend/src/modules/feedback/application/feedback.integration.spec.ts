import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FeedbackEmailMode, FeedbackFormStatus, FeedbackQuestionKind, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { ProductService } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { LiveSessionService } from '../../events/application/live-session.service';
import { SessionOfflineSaleHandler } from '../../events/application/session-offline-sale.handler';
import { SessionShowcase } from '../../events/application/session-showcase';
import { SessionTestimonialSectionsService } from '../../events/application/session-testimonial-sections.service';
import { OfflineSaleHandlers } from '../../orders/application/offline-sale-handlers';
import { OfflineSaleService } from '../../orders/application/offline-sale.service';
import { OrderService } from '../../orders/application/order.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { FeedbackAudience } from './feedback-audience';
import { FeedbackFormsService } from './feedback-forms.service';
import { FeedbackHighlightsService } from './feedback-highlights.service';
import { FeedbackInvitesService } from './feedback-invites.service';
import { FeedbackResponsesService } from './feedback-responses.service';

/**
 * Feedback forms against a real Postgres, wired by hand like the other specs.
 * Seats are recorded as offline sales so each one's time is exact. Day 1 is
 * over (it ended 28 hours ago); Day 2 is tomorrow.
 */

const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') return 'test-stub-secret-at-least-16-chars';
    if (key === 'MAIN_WEBSITE_URL') return 'https://jsmf.test';
    if (key === 'STORAGE_SIGNING_SECRET') return 'storage-signing-secret-for-tests';
    if (key === 'FEEDBACK_LINK_SECRET') return undefined;
    return process.env[key];
  },
} as never;

type Sent = { to: { email: string }; subject: string; text: string; tag?: string };
const sentMail: Sent[] = [];
const failNext = new Set<string>();
const mail = {
  sendBestEffort(request: Sent) {
    if (failNext.delete(request.to.email)) return Promise.resolve({ delivered: false as const, reason: 'error' as const });
    sentMail.push(request);
    return Promise.resolve({ delivered: true as const, messageId: 'test' });
  },
} as never;
const storage = { getSignedDownloadUrl: () => Promise.resolve('https://example.test/image.png') } as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const entitlements = new EntitlementService(prisma);
const products = new ProductService(prisma, audit);
const orders = new OrderService(prisma, new StubPaymentAdapter(config), entitlements);
const showcase = new SessionShowcase();
const sessions = new LiveSessionService(prisma, products, orders, entitlements, audit, storage, config, showcase);
const sections = new SessionTestimonialSectionsService(prisma, storage, audit);
const handlers = new OfflineSaleHandlers();
new SessionOfflineSaleHandler(prisma, handlers, config).onModuleInit();
const offline = new OfflineSaleService(prisma, entitlements, handlers, audit);

const audience = new FeedbackAudience(prisma);
const invites = new FeedbackInvitesService(prisma, audience, mail, config, new SweepRegistry());
const forms = new FeedbackFormsService(prisma, audience, invites, audit);
const responses = new FeedbackResponsesService(prisma, audience, invites);
const highlights = new FeedbackHighlightsService(prisma, audience, showcase, audit);
highlights.onModuleInit();

const tag = randomUUID().slice(0, 8);
const created = { productIds: [] as string[], emails: [] as string[] };
const HOUR = 3600_000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
let adminId: string;
const admin = () => ({ id: adminId });

async function createSession() {
  const session = await sessions.create(
    {
      title: `Feedback spec ${randomUUID().slice(0, 6)}`,
      tagline: 'A test session',
      days: [
        { startsAt: inHours(48), durationMinutes: 120 },
        { startsAt: inHours(72), durationMinutes: 120 },
      ],
      platformLabel: 'Live on Zoom',
      priceAmountMinor: '9900',
      highlights: ['One'],
    },
    admin(),
  );
  created.productIds.push(session.id);
  await sessions.publish(session.id, admin());
  await sessions.update(
    session.id,
    {
      days: [
        { startsAt: hoursAgo(30), durationMinutes: 120 },
        { startsAt: inHours(24), durationMinutes: 120 },
      ],
    },
    admin(),
  );
  const view = await sessions.getForAdmin(session.id);
  return { id: session.id, slug: view.slug, day1: view.days[0].id, day2: view.days[1].id };
}

async function seat(sessionId: string, label: string, paidAt: string) {
  const email = `feedback-${label}-${tag}@jsmf.test`;
  created.emails.push(email);
  await offline.record(
    sessionId,
    [{ name: `${label} Person`, email, amountPaidMinor: '9900', method: 'UPI_DIRECT', paidAt }],
    { userId: adminId, entry: 'FORM' },
  );
  return prisma.user.findUniqueOrThrow({ where: { email } });
}

/** The token from the link in someone's latest email. */
function tokenFrom(email: string): string {
  const message = [...sentMail].reverse().find((m) => m.to.email === email);
  const match = message?.text.match(/\?k=([^\s]+)/);
  if (!match) throw new Error(`No feedback link emailed to ${email}`);
  return decodeURIComponent(match[1]);
}

beforeAll(async () => {
  await prisma.$connect();
  const email = `feedback-admin-${tag}@jsmf.test`;
  created.emails.push(email);
  adminId = (await prisma.user.create({ data: { email, name: 'Admin', status: UserStatus.ACTIVE } })).id;
});

beforeEach(() => {
  sentMail.length = 0;
});

afterAll(async () => {
  const productIds = created.productIds;
  const userIds = (await prisma.user.findMany({ where: { email: { in: created.emails } }, select: { id: true } })).map(
    (u) => u.id,
  );
  const formIds = (await prisma.feedbackForm.findMany({ where: { liveSessionId: { in: productIds } }, select: { id: true } })).map(
    (f) => f.id,
  );
  await prisma.feedbackHighlight.deleteMany({ where: { response: { formId: { in: formIds } } } });
  await prisma.feedbackAnswer.deleteMany({ where: { response: { formId: { in: formIds } } } });
  await prisma.feedbackResponse.deleteMany({ where: { formId: { in: formIds } } });
  await prisma.feedbackForm.deleteMany({ where: { id: { in: formIds } } });
  await prisma.sessionTestimonialSection.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.offlineSale.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.sessionDayReminder.deleteMany({ where: { day: { liveSessionId: { in: productIds } } } });
  await prisma.sessionRegistration.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSessionDay.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSession.deleteMany({ where: { productId: { in: productIds } } });
  const orderIds = (await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((o) => o.id);
  await prisma.entitlement.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...productIds, ...orderIds, ...formIds] } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('feedback forms', () => {
  it('emails Day 1 attendees once the day is over, never late joiners, and never twice', async () => {
    const session = await createSession();
    const early = await seat(session.id, 'early', hoursAgo(48));
    await seat(session.id, 'late', hoursAgo(1)); // joined after Day 1 ended

    const form = await forms.create(session.id, { dayId: session.day1 }, admin());
    expect(form.title).toBe('Day 1 feedback');
    expect(form.questions.length).toBeGreaterThan(0);

    // A draft sends nothing, even with its day over.
    expect((await invites.sendDue()).sent).toBe(0);

    await forms.update(session.id, form.id, { status: FeedbackFormStatus.OPEN }, admin());
    await invites.sendDue();
    expect(sentMail.map((m) => m.to.email)).toEqual([early.email]);
    expect(sentMail[0].subject).toContain('Day 1');

    // The next tick finds nobody new.
    sentMail.length = 0;
    await invites.sendDue();
    expect(sentMail).toHaveLength(0);

    const people = await invites.people(session.id, form.id);
    expect(people.total).toBe(1);
    expect(people.emailed).toBe(1);
  });

  it('opens from the personal link without signing in, saves one reply per person, and can be edited', async () => {
    const session = await createSession();
    const student = await seat(session.id, 'student', hoursAgo(48));
    const form = await forms.create(session.id, { dayId: session.day1 }, admin());
    await forms.update(session.id, form.id, { status: FeedbackFormStatus.OPEN, emailMode: FeedbackEmailMode.MANUAL }, admin());
    expect((await invites.sendDue()).sent).toBe(0); // manual: nothing on its own

    await invites.send(session.id, form.id);
    const token = tokenFrom(student.email!);

    const signedOut = await responses.view(form.id, {});
    expect(signedOut.state).toBe('SIGN_IN_REQUIRED');

    const view = await responses.view(form.id, { token });
    expect(view.state).toBe('OPEN');
    expect(view.respondent?.firstName).toBe('student');
    expect((await invites.people(session.id, form.id)).opened).toBe(1);

    const [overall, , useful] = view.form.questions;
    await expect(responses.submit(form.id, {}, { token, answers: [] })).rejects.toThrow(/needs an answer/);
    await responses.submit(form.id, {}, {
      token,
      answers: [
        { questionId: overall.id, rating: 4 },
        { questionId: useful.id, text: 'The mnemonics for cranial nerves were brilliant.' },
      ],
      consentToPublish: true,
    });
    const edited = await responses.submit(form.id, {}, {
      token,
      answers: [{ questionId: overall.id, rating: 5 }, { questionId: useful.id, text: 'Everything!' }],
      consentToPublish: true,
    });
    expect(edited.edited).toBe(true);
    expect(await prisma.feedbackResponse.count({ where: { formId: form.id } })).toBe(1);

    // Replied: no reminder goes to them.
    sentMail.length = 0;
    const reminded = await invites.send(session.id, form.id, { includeAlreadyEmailed: true });
    expect(reminded.sent).toBe(0);

    const results = await forms.results(session.id, form.id);
    expect(results.total).toBe(1);
    expect(results.summary.find((s) => s.questionId === overall.id)).toMatchObject({ average: 5 });

    // A forged token is worth nothing.
    const forged = token.slice(0, -2) + 'zz';
    expect((await responses.view(form.id, { token: forged })).state).toBe('SIGN_IN_REQUIRED');
  });

  it('accepts the shared link only from a seat holder, and refuses after a refund-like revoke', async () => {
    const session = await createSession();
    const holder = await seat(session.id, 'holder', hoursAgo(48));
    const stranger = await prisma.user.create({
      data: { email: `feedback-stranger-${tag}@jsmf.test`, name: 'Stranger', status: UserStatus.ACTIVE },
    });
    created.emails.push(stranger.email!);
    const form = await forms.create(session.id, { dayId: session.day1 }, admin());
    await forms.update(session.id, form.id, { status: FeedbackFormStatus.OPEN, emailMode: FeedbackEmailMode.MANUAL }, admin());

    const asUser = (id: string) => ({ user: { id, email: null, name: '', roles: [] } as never });
    expect((await responses.view(form.id, asUser(holder.id))).state).toBe('OPEN');
    expect((await responses.view(form.id, asUser(stranger.id))).state).toBe('NOT_ELIGIBLE');

    const seatRow = await prisma.entitlement.findFirstOrThrow({ where: { userId: holder.id, productId: session.id } });
    await entitlements.revoke(seatRow.id, 'test');
    expect((await responses.view(form.id, asUser(holder.id))).state).toBe('NOT_ELIGIBLE');
  });

  it('keeps answered questions: kind is fixed, removal archives', async () => {
    const session = await createSession();
    const student = await seat(session.id, 'q', hoursAgo(48));
    const form = await forms.create(session.id, { dayId: session.day1 }, admin());
    await forms.update(session.id, form.id, { status: FeedbackFormStatus.OPEN, emailMode: FeedbackEmailMode.MANUAL }, admin());
    const overall = form.questions[0];
    await responses.submit(form.id, { user: { id: student.id } as never }, { answers: [{ questionId: overall.id, rating: 3 }] });

    const asDrafts = form.questions.map((q) => ({ ...q }));
    await expect(
      forms.replaceQuestions(session.id, form.id, [{ ...asDrafts[0], kind: FeedbackQuestionKind.SCALE }], admin()),
    ).rejects.toThrow(/cannot change/);

    const after = await forms.replaceQuestions(
      session.id,
      form.id,
      [{ kind: FeedbackQuestionKind.SHORT_TEXT, label: 'One word for today?' }],
      admin(),
    );
    expect(after.questions.map((q) => q.label)).toEqual(['One word for today?']);
    const archived = await prisma.feedbackQuestion.findUniqueOrThrow({ where: { id: overall.id } });
    expect(archived.archivedAt).not.toBeNull();
    const others = await prisma.feedbackQuestion.count({ where: { formId: form.id, archivedAt: null } });
    expect(others).toBe(1); // unanswered defaults were deleted outright
    expect((await forms.results(session.id, form.id)).questions.find((q) => q.id === overall.id)?.archived).toBe(true);

    await expect(forms.remove(session.id, form.id, admin())).rejects.toThrow(/Close it instead/);
  });

  it('shows a consented reply on the website, and takes it down when consent is withdrawn', async () => {
    const session = await createSession();
    const student = await seat(session.id, 'Riya', hoursAgo(48));
    const shy = await seat(session.id, 'Shy', hoursAgo(48));
    const form = await forms.create(session.id, { dayId: session.day1 }, admin());
    await forms.update(
      session.id,
      form.id,
      { status: FeedbackFormStatus.OPEN, emailMode: FeedbackEmailMode.MANUAL, allowAnonymous: true, askConsentToPublish: true },
      admin(),
    );
    const section = await sections.create(session.id, { heading: 'What students said after Day 1', dayId: session.day1 }, admin());
    const [overall, , useful] = form.questions;
    const reply = (userId: string, extra: object) =>
      responses.submit(form.id, { user: { id: userId } as never }, {
        answers: [{ questionId: overall.id, rating: 5 }, { questionId: useful.id, text: 'Loved the case discussions.' }],
        ...extra,
      });

    await reply(student.id, { consentToPublish: true });
    await reply(shy.id, { consentToPublish: false });
    const results = await forms.results(session.id, form.id);
    const mine = results.responses.find((r) => r.name === student.name)!;
    const theirs = results.responses.find((r) => r.name === shy.name)!;

    await expect(
      highlights.create(session.id, form.id, { responseId: theirs.id, sectionId: section.id }, admin()),
    ).rejects.toThrow(/did not agree/);
    const card = await highlights.create(session.id, form.id, { responseId: mine.id, sectionId: section.id }, admin());
    expect(card).toMatchObject({ quote: 'Loved the case discussions.', rating: 5 });

    // On the public page, inside the section, even though it has no screenshots.
    const page = await sessions.publicBySlug(session.slug);
    const shown = page.testimonialSections.find((s) => s.id === section.id);
    expect(shown?.quotes.map((q) => q.quote)).toEqual(['Loved the case discussions.']);

    // Going anonymous keeps the card, without the name.
    await reply(student.id, { consentToPublish: true, isAnonymous: true });
    const again = await sessions.publicBySlug(session.slug);
    expect(again.testimonialSections.find((s) => s.id === section.id)?.quotes[0].attribution).toBe('A JSMF student');
    const anonymous = (await forms.results(session.id, form.id)).responses.find((r) => r.id === mine.id)!;
    expect(anonymous).toMatchObject({ isAnonymous: true, name: null, email: null });

    // Withdrawing consent takes it down.
    await reply(student.id, { consentToPublish: false, isAnonymous: true });
    const gone = await sessions.publicBySlug(session.slug);
    expect(gone.testimonialSections.find((s) => s.id === section.id)).toBeUndefined();
  });

  it("without the consent question, the team picks any reply; the name defaults to the student's choice", async () => {
    const session = await createSession();
    const named = await seat(session.id, 'Asha', hoursAgo(48));
    const unnamed = await seat(session.id, 'Quiet', hoursAgo(48));
    const form = await forms.create(session.id, { dayId: session.day1, templateKey: 'quick-pulse' }, admin());
    expect(form.title).toBe('Day 1: quick feedback');
    expect(form.questions).toHaveLength(2);
    expect(form).toMatchObject({ askConsentToPublish: false, askShowName: false });
    await forms.update(session.id, form.id, { status: FeedbackFormStatus.OPEN, emailMode: FeedbackEmailMode.MANUAL, askShowName: true }, admin());
    const section = await sections.create(session.id, { heading: 'Day 1, in their words', dayId: session.day1 }, admin());
    const [rating, line] = form.questions;
    const reply = (userId: string, showName: boolean) =>
      responses.submit(form.id, { user: { id: userId } as never }, {
        answers: [{ questionId: rating.id, rating: 4 }, { questionId: line.id, text: `Said by ${showName}` }],
        showName,
      });
    await reply(named.id, true);
    await reply(unnamed.id, false);

    const results = await forms.results(session.id, form.id);
    const a = results.responses.find((r) => r.name === named.name)!;
    const b = results.responses.find((r) => r.name === unnamed.name)!;
    const cardA = await highlights.create(session.id, form.id, { responseId: a.id, sectionId: section.id }, admin());
    const cardB = await highlights.create(session.id, form.id, { responseId: b.id, sectionId: section.id }, admin());
    expect(cardA.attribution).toMatch(/^Asha/);
    expect(cardB.attribution).toBe('A JSMF student');

    const page = await sessions.publicBySlug(session.slug);
    expect(page.testimonialSections.find((s) => s.id === section.id)?.quotes).toHaveLength(2);

    // The admin has the last word: the name can be shown despite the "no".
    await prisma.feedbackHighlight.delete({ where: { id: cardB.id } });
    const overridden = await highlights.create(session.id, form.id, { responseId: b.id, sectionId: section.id, showName: true }, admin());
    expect(overridden.attribution).toMatch(/^Quiet/);
    // A later change of answer is guidance only: the card is left alone.
    await reply(named.id, false);
    const after = await prisma.feedbackHighlight.findUniqueOrThrow({ where: { id: cardA.id } });
    expect(after.attribution).toMatch(/^Asha/);
  });

  describe('no-sign-in Telegram link (openLink)', () => {
    const key = (n: number) => `browser-key-${tag}-${n}`.padEnd(40, 'x');

    async function openForm(settings: Record<string, unknown> = {}) {
      const session = await createSession();
      const holder = await seat(session.id, `open-holder-${randomUUID().slice(0, 4)}`, hoursAgo(48));
      const form = await forms.create(session.id, { dayId: session.day1, templateKey: 'quick-pulse' }, admin());
      await forms.update(
        session.id,
        form.id,
        { status: FeedbackFormStatus.OPEN, emailMode: FeedbackEmailMode.MANUAL, ...settings },
        admin(),
      );
      const [rating, line] = form.questions;
      const answers = (text: string) => [
        { questionId: rating.id, rating: 5 },
        { questionId: line.id, text },
      ];
      return { session, holder, form, answers };
    }

    it('is off by default: signed out still has to sign in, and an open reply is refused', async () => {
      const { form, answers } = await openForm();
      expect(form.openLink).toBe(false);
      const view = await responses.view(form.id, {});
      expect(view).toMatchObject({ state: 'SIGN_IN_REQUIRED', mode: null });
      await expect(
        responses.submitOpen(form.id, { respondentName: 'Riya', editKey: key(0), answers: answers('Hi') }),
      ).rejects.toThrow(/sign in/i);
    });

    it('takes a named reply without signing in; the same browser edits it, another browser adds one', async () => {
      const { session, holder, form, answers } = await openForm({ openLink: true, askShowName: true });

      const signedOut = await responses.view(form.id, {});
      expect(signedOut).toMatchObject({ state: 'OPEN', mode: 'OPEN_LINK', response: null });
      expect(signedOut.form.openLink).toBe(true);

      // Name is required, and only spaces does not count.
      await expect(
        responses.submitOpen(form.id, { respondentName: '   ', editKey: key(1), answers: answers('x') }),
      ).rejects.toThrow(/Enter your name/);

      const first = await responses.submitOpen(form.id, {
        respondentName: '  Riya   Sharma ',
        editKey: key(1),
        answers: answers('First go'),
        showName: true,
      });
      expect(first.edited).toBe(false);

      // Same browser: its reply comes back, and sending again changes it.
      const again = await responses.view(form.id, { editKey: key(1) });
      expect(again.response).toMatchObject({ respondentName: 'Riya Sharma', showName: true });
      const edited = await responses.submitOpen(form.id, {
        respondentName: 'Riya Sharma',
        editKey: key(1),
        answers: answers('Changed my mind'),
      });
      expect(edited.edited).toBe(true);

      // Another browser is another reply.
      await responses.submitOpen(form.id, { respondentName: 'Kabir', editKey: key(2), answers: answers('Second') });

      // A seat holder who is signed in still replies as themselves.
      const asHolder = await responses.view(form.id, { user: { id: holder.id, roles: [] } as never });
      expect(asHolder).toMatchObject({ state: 'OPEN', mode: 'PERSONAL' });

      const results = await forms.results(session.id, form.id);
      expect(results.total).toBe(2);
      const riya = results.responses.find((r) => r.name === 'Riya Sharma')!;
      expect(riya).toMatchObject({ source: 'OPEN_LINK', verified: false, email: null, stage: null, showName: false });
      expect(riya.answers.find((a) => a.text)?.text).toBe('Changed my mind');

      // Not in the "who's been asked" table, but counted.
      const people = await invites.people(session.id, form.id);
      expect(people.responded).toBe(0);
      expect(people.openLinkResponses).toBe(2);
      expect(people.otherResponses).toBe(0);

      // A website card uses the typed first name.
      const section = await sections.create(session.id, { heading: 'Open link quotes', dayId: session.day1 }, admin());
      const card = await highlights.create(
        session.id,
        form.id,
        { responseId: riya.id, sectionId: section.id, showName: true },
        admin(),
      );
      expect(card.attribution).toBe('Riya');
    });

    it('still asks for consent where the form does, and never hides the typed name', async () => {
      const { session, form, answers } = await openForm({
        openLink: true,
        askConsentToPublish: true,
        allowAnonymous: true,
      });
      await responses.submitOpen(form.id, {
        respondentName: 'Meera',
        editKey: key(3),
        answers: answers('Loved it'),
        consentToPublish: false,
        // Not part of the open reply; must be ignored if a client sends it.
        ...({ isAnonymous: true } as object),
      } as never);

      const [reply] = (await forms.results(session.id, form.id)).responses;
      expect(reply).toMatchObject({ name: 'Meera', isAnonymous: false, consentToPublish: false });
      const section = await sections.create(session.id, { heading: 'Consent quotes', dayId: session.day1 }, admin());
      await expect(
        highlights.create(session.id, form.id, { responseId: reply.id, sectionId: section.id }, admin()),
      ).rejects.toThrow(/did not agree/);
    });

    it('refuses open replies once the form has closed', async () => {
      const { session, form, answers } = await openForm({ openLink: true });
      await forms.update(session.id, form.id, { status: FeedbackFormStatus.CLOSED }, admin());
      expect((await responses.view(form.id, {})).state).toBe('CLOSED');
      await expect(
        responses.submitOpen(form.id, { respondentName: 'Late', editKey: key(4), answers: answers('Late') }),
      ).rejects.toThrow(/closed/);
    });
  });

  it('imports questions from a form on another session', async () => {
    const first = await createSession();
    const second = await createSession();
    const original = await forms.create(first.id, { dayId: first.day2, templateKey: 'day-detailed' }, admin());
    const copy = await forms.create(second.id, { dayId: second.day1, copyFromFormId: original.id }, admin());
    expect(copy.title).toBe('Day 1 feedback');
    expect(copy.questions.map((q) => q.label)).toEqual(original.questions.map((q) => q.label));
    expect((await forms.importable()).some((f) => f.id === original.id)).toBe(true);
    await expect(forms.create(second.id, { templateKey: 'nope' }, admin())).rejects.toThrow(/template/);
  });

  it("refuses to delete a day that has a feedback form, in plain words", async () => {
    const session = await createSession();
    await forms.create(session.id, { dayId: session.day2 }, admin());
    const view = await sessions.getForAdmin(session.id);
    await expect(
      sessions.update(
        session.id,
        { days: [{ id: view.days[0].id, startsAt: view.days[0].startsAt.toISOString(), durationMinutes: 120 }] },
        admin(),
      ),
    ).rejects.toThrow(/feedback form/);
  });

  it("names the session by its short name in the email, not the booking card's title", async () => {
    const session = await createSession();
    const student = await seat(session.id, 'named', hoursAgo(48));
    await sessions.update(session.id, { shortName: 'NEET-PG Revision Bootcamp' }, admin());
    const form = await forms.create(session.id, { dayId: session.day1 }, admin());
    await forms.update(session.id, form.id, { status: FeedbackFormStatus.OPEN, emailMode: FeedbackEmailMode.MANUAL }, admin());

    await invites.send(session.id, form.id);
    const mail = sentMail.find((m) => m.to.email === student.email)!;
    expect(mail.subject).toContain('NEET-PG Revision Bootcamp');
    expect(mail.subject).not.toContain('Feedback spec');
    expect((await sessions.getForAdmin(session.id)).shortName).toBe('NEET-PG Revision Bootcamp');

    // Cleared: back to the title.
    await sessions.update(session.id, { shortName: '' }, admin());
    expect((await sessions.getForAdmin(session.id)).shortName).toBeNull();
  });

  it('records a failed email for retry, and an admin retry sends it', async () => {
    const session = await createSession();
    const student = await seat(session.id, 'bounce', hoursAgo(48));
    const form = await forms.create(session.id, { dayId: session.day1 }, admin());
    await forms.update(session.id, form.id, { status: FeedbackFormStatus.OPEN, emailMode: FeedbackEmailMode.MANUAL }, admin());

    failNext.add(student.email!);
    const first = await invites.send(session.id, form.id);
    expect(first.failed).toHaveLength(1);
    const row = (await invites.people(session.id, form.id)).rows[0];
    expect(row).toMatchObject({ emailedAt: null, lastError: expect.any(String) });

    const retry = await invites.send(session.id, form.id, { userIds: [student.id] });
    expect(retry.sent).toBe(1);
    expect((await invites.people(session.id, form.id)).rows[0].lastError).toBeNull();
  });
});
