import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OfflineSaleEntry, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ProductService } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OfflineSaleHandlers } from '../../orders/application/offline-sale-handlers';
import { OfflineSaleService } from '../../orders/application/offline-sale.service';
import { OrderEvents } from '../../orders/application/order-events';
import { OrderService } from '../../orders/application/order.service';
import { PaymentService } from '../../orders/application/payment.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { LiveSessionNotifications } from './live-session-notifications.service';
import { LiveSessionService } from './live-session.service';
import { SessionDetailsService } from './session-details.service';
import { SessionOfflineSaleHandler } from './session-offline-sale.handler';

/**
 * Session details against a real Postgres, wired by hand like the other specs.
 * One test per case agreed for the feature: each attendee gets exactly what
 * they still need — never sent, or changed since — in one email, and every
 * email that carries a detail counts.
 */

const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') return 'test-stub-secret-at-least-16-chars';
    if (key === 'STOREFRONT_URL') return 'http://localhost:3001';
    if (key === 'SESSION_REMINDER_LEAD_MINUTES') return 60;
    return process.env[key];
  },
} as never;

type Sent = { to: { email: string }; subject: string; text: string; tag?: string };
const sentMail: Sent[] = [];
/** Addresses whose next email fails, to test what a failure leaves behind. */
const failNext = new Set<string>();
const mail = {
  sendBestEffort(request: Sent) {
    if (failNext.delete(request.to.email)) return Promise.resolve({ delivered: false as const, reason: 'Mailbox full' });
    sentMail.push(request);
    return Promise.resolve({ delivered: true as const, messageId: 'test' });
  },
} as never;
const whatsapp = { enabled: () => false, send: () => Promise.resolve({ delivered: true }) } as never;
const storage = { getSignedDownloadUrl: () => Promise.resolve('https://example.test/x.png') } as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const provider = new StubPaymentAdapter(config);
const entitlements = new EntitlementService(prisma);
const events = new OrderEvents();
const products = new ProductService(prisma, audit);
const orders = new OrderService(prisma, provider, entitlements);
const payments = new PaymentService(prisma, provider, entitlements, mail, whatsapp, config, events);
const sessions = new LiveSessionService(prisma, products, orders, entitlements, audit, storage, config);
const details = new SessionDetailsService(prisma, mail);
const notifications = new LiveSessionNotifications(prisma, mail, config, events, entitlements, details);
notifications.onModuleInit();
const handlers = new OfflineSaleHandlers();
new SessionOfflineSaleHandler(prisma, handlers, config).onModuleInit();
const offline = new OfflineSaleService(prisma, entitlements, handlers, audit);

const tag = randomUUID().slice(0, 8);
const created = { userIds: [] as string[], productIds: [] as string[], emails: [] as string[] };
const PRICE = 9900n;
const HOUR = 3600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const ZOOM_A = 'https://zoom.us/j/aaa';
const ZOOM_B = 'https://zoom.us/j/bbb';
const TELEGRAM = 'https://t.me/+groupOne';
let adminId: string;

async function createUser(label: string) {
  const email = `details-${label}-${tag}@jsmf.test`;
  created.emails.push(email);
  const user = await prisma.user.create({ data: { email, name: `Person ${label}`, status: UserStatus.ACTIVE } });
  created.userIds.push(user.id);
  return user;
}

async function createSession(input: { joinUrl?: string; telegramUrl?: string; days?: Array<{ startsAt: string; durationMinutes: number }> } = {}) {
  const session = await sessions.create(
    {
      title: `Details spec ${randomUUID().slice(0, 6)}`,
      tagline: 'A test session',
      days: input.days ?? [
        { startsAt: inHours(48), durationMinutes: 180 },
        { startsAt: inHours(72), durationMinutes: 180 },
      ],
      platformLabel: 'Live on Zoom',
      priceAmountMinor: PRICE.toString(),
      highlights: ['One'],
      joinUrl: input.joinUrl,
      telegramUrl: input.telegramUrl,
    },
    { id: adminId },
  );
  created.productIds.push(session.id);
  await sessions.publish(session.id, { id: adminId });
  return session;
}

async function pay(userId: string, sessionId: string) {
  const checkout = await sessions.register(userId, sessionId, { whatsappNumber: '9876543210', exam: 'NEET-PG', stage: 'Intern' });
  if (checkout.kind !== 'PAYMENT_REQUIRED') throw new Error('sessions are paid');
  const delivery = provider.simulateWebhook({ providerOrderId: checkout.providerOrderId, amountMinor: PRICE });
  await payments.handleWebhook(delivery.rawBody, delivery.headers);
}

const update = (id: string, input: Parameters<LiveSessionService['update']>[1]) => sessions.update(id, input, { id: adminId });
const rowFor = async (sessionId: string, userId: string) =>
  (await details.overview(sessionId)).rows.find((row) => row.userId === userId)!;
const detailsMailTo = (email: string) => sentMail.filter((m) => m.tag === 'session-details' && m.to.email === email);

beforeAll(async () => {
  await prisma.$connect();
  adminId = (await createUser('admin')).id;
});

beforeEach(() => {
  sentMail.length = 0;
});

afterAll(async () => {
  const productIds = created.productIds;
  const users = await prisma.user.findMany({ where: { email: { in: created.emails } }, select: { id: true } });
  const userIds = [...new Set([...created.userIds, ...users.map((u) => u.id)])];
  await prisma.offlineSale.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.sessionDetailReceipt.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionDetailEmail.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionDayReminder.deleteMany({ where: { day: { liveSessionId: { in: productIds } } } });
  await prisma.sessionRegistration.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSessionDay.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSession.deleteMany({ where: { productId: { in: productIds } } });
  const orderIds = (await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((o) => o.id);
  await prisma.entitlement.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...productIds, ...orderIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('session details', () => {
  it('cases 2 + 3: paid before the links gets both links; paid after them is already up to date', async () => {
    const session = await createSession();
    const early = await createUser('early');
    await pay(early.id, session.id);

    // The confirmation carried the dates, nothing else existed yet.
    expect((await rowFor(session.id, early.id)).statuses).toEqual({
      dates: 'UP_TO_DATE',
      join_link: 'NOT_SET',
      telegram: 'NOT_SET',
    });

    await update(session.id, { joinUrl: ZOOM_A, telegramUrl: TELEGRAM });
    const late = await createUser('late');
    await pay(late.id, session.id);

    const confirmation = sentMail.find((m) => m.tag === 'session-confirmation' && m.to.email === late.email)!;
    expect(confirmation.text).toContain(ZOOM_A);
    expect(confirmation.text).toContain('Telegram group just for registered candidates');
    expect(confirmation.text).toContain(TELEGRAM);

    const overview = await details.overview(session.id);
    expect(overview.summary).toEqual({
      dates: { notSent: 0, changed: 0 },
      join_link: { notSent: 1, changed: 0 },
      telegram: { notSent: 1, changed: 0 },
    });
    expect(overview.rows.find((r) => r.userId === late.id)!.outstanding).toEqual([]);
    expect(overview.rows.find((r) => r.userId === early.id)!.outstanding).toEqual(['join_link', 'telegram']);

    sentMail.length = 0;
    const result = await details.send(session.id);
    expect(result).toMatchObject({ sent: 1, upToDate: 1, failed: [] });

    const [email] = detailsMailTo(early.email!);
    expect(email.subject).toContain('Your session details');
    expect(email.text).toContain(ZOOM_A);
    expect(email.text).toContain(TELEGRAM);
    expect(detailsMailTo(late.email!)).toHaveLength(0);

    // Pressing it again reaches nobody.
    expect(await details.send(session.id)).toMatchObject({ sent: 0, upToDate: 2 });
  });

  it('case 4: a Telegram link added later goes out alone', async () => {
    const session = await createSession({ joinUrl: ZOOM_A });
    const buyer = await createUser('tg-later');
    await pay(buyer.id, session.id);

    await update(session.id, { telegramUrl: TELEGRAM });
    expect((await rowFor(session.id, buyer.id)).outstanding).toEqual(['telegram']);

    await details.send(session.id);
    const [email] = detailsMailTo(buyer.email!);
    expect(email.subject).toContain('Join the Telegram group');
    expect(email.text).toContain(TELEGRAM);
    expect(email.text).not.toContain(ZOOM_A);
  });

  it('cases 5 + 11: a changed joining link goes out as an update; going back makes them up to date again', async () => {
    const session = await createSession({ joinUrl: ZOOM_A, telegramUrl: TELEGRAM });
    const buyer = await createUser('link-change');
    await pay(buyer.id, session.id);

    await update(session.id, { joinUrl: ZOOM_B });
    expect((await rowFor(session.id, buyer.id)).statuses.join_link).toBe('CHANGED');

    // Back to the link they already have: nothing to send.
    await update(session.id, { joinUrl: ZOOM_A });
    expect((await rowFor(session.id, buyer.id)).outstanding).toEqual([]);

    await update(session.id, { joinUrl: ZOOM_B });
    await details.send(session.id);
    const [email] = detailsMailTo(buyer.email!);
    expect(email.subject).toContain('Updated joining link');
    expect(email.text).toContain(`New joining link: ${ZOOM_B}`);
    expect(email.text).not.toContain(TELEGRAM);

    // Now they hold B, so going back to A means they need A again.
    await update(session.id, { joinUrl: ZOOM_A });
    expect((await rowFor(session.id, buyer.id)).statuses.join_link).toBe('CHANGED');
  });

  it('case 7: moving any day — not just the first — sends the updated schedule alone', async () => {
    const days = [
      { startsAt: inHours(48), durationMinutes: 180 },
      { startsAt: inHours(72), durationMinutes: 180 },
    ];
    const session = await createSession({ joinUrl: ZOOM_A, days });
    const buyer = await createUser('day2');
    await pay(buyer.id, session.id);

    const current = await sessions.getForAdmin(session.id);
    await update(session.id, {
      days: [
        { id: current.days[0].id, startsAt: days[0].startsAt, durationMinutes: 180 },
        { id: current.days[1].id, startsAt: inHours(73), durationMinutes: 180 },
      ],
    });
    expect((await rowFor(session.id, buyer.id)).outstanding).toEqual(['dates']);

    await details.send(session.id);
    const [email] = detailsMailTo(buyer.email!);
    expect(email.subject).toContain('Updated schedule');
    expect(email.text).not.toContain(ZOOM_A);
  });

  // Case 9 (the reminder counts for the joining link) is in live-session.integration.spec.ts: the
  // reminder sweep covers every session in the database, so only that file runs it.
  it('case 1: a buyer added by hand needs everything', async () => {
    // Days far off on purpose: a day inside the reminder window would be picked
    // up by the reminder sweep that live-session.integration.spec.ts runs.
    const session = await createSession({ joinUrl: ZOOM_A, telegramUrl: TELEGRAM });
    const email = `details-offline-${tag}@jsmf.test`;
    created.emails.push(email);
    await offline.record(
      session.id,
      [{ name: 'Offline Buyer', email, amountPaidMinor: '9900', method: 'UPI_DIRECT', paidAt: new Date(Date.now() - HOUR).toISOString() }],
      { userId: adminId, entry: OfflineSaleEntry.FORM },
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect((await rowFor(session.id, user.id)).outstanding).toEqual(['dates', 'join_link', 'telegram']);
  });

  it('case 10: a cleared link drops out, and nobody is emailed for it', async () => {
    const session = await createSession({ joinUrl: ZOOM_A, telegramUrl: TELEGRAM });
    const buyer = await createUser('cleared');
    await pay(buyer.id, session.id);
    await update(session.id, { telegramUrl: 'https://t.me/+groupTwo' });
    expect((await rowFor(session.id, buyer.id)).outstanding).toEqual(['telegram']);

    await update(session.id, { telegramUrl: null });
    const row = await rowFor(session.id, buyer.id);
    expect(row.statuses.telegram).toBe('NOT_SET');
    expect(row.outstanding).toEqual([]);
  });

  it('case 12: dates without a joining link say the link will follow; adding it later makes it due', async () => {
    const session = await createSession();
    const email = `details-dates-only-${tag}@jsmf.test`;
    created.emails.push(email);
    await offline.record(
      session.id,
      [{ name: 'Dates Only', email, amountPaidMinor: '9900', method: 'CASH', paidAt: new Date(Date.now() - HOUR).toISOString() }],
      { userId: adminId, entry: OfflineSaleEntry.FORM },
    );

    await details.send(session.id);
    const [sent] = detailsMailTo(email);
    expect(sent.subject).toContain('Dates confirmed');
    expect(sent.text).toContain('We will email you the joining link');

    await update(session.id, { joinUrl: ZOOM_A });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect((await rowFor(session.id, user.id)).outstanding).toEqual(['join_link']);
  });

  it('case 13: links go out even before the dates are fixed; with nothing at all, sending is refused', async () => {
    const session = await createSession({ days: [] });
    const buyer = await createUser('undated');
    await pay(buyer.id, session.id);

    expect((await details.overview(session.id)).blocker).toMatch(/nothing to send/i);
    await expect(details.send(session.id)).rejects.toMatchObject({ status: 400 });

    await update(session.id, { telegramUrl: TELEGRAM });
    await details.send(session.id);
    expect(detailsMailTo(buyer.email!)[0].subject).toContain('Join the Telegram group');
  });

  it('a failed email is logged with its reason, changes nothing, and is retried by the next send', async () => {
    const session = await createSession();
    const buyer = await createUser('bounce');
    await pay(buyer.id, session.id);
    await update(session.id, { joinUrl: ZOOM_A });

    failNext.add(buyer.email!);
    const first = await details.send(session.id);
    expect(first.failed).toEqual([expect.objectContaining({ userId: buyer.id, reason: 'Mailbox full' })]);
    const row = await rowFor(session.id, buyer.id);
    expect(row.outstanding).toEqual(['join_link']);
    expect(row.lastEmail).toMatchObject({ status: 'FAILED', error: 'Mailbox full', items: ['join_link'] });

    expect(await details.send(session.id)).toMatchObject({ sent: 1, failed: [] });
    expect((await rowFor(session.id, buyer.id)).lastEmail).toMatchObject({ status: 'SENT' });
  });

  it('sends only to the people chosen, and never lists or emails someone refunded', async () => {
    const session = await createSession();
    const [one, two] = [await createUser('pick-1'), await createUser('pick-2')];
    await pay(one.id, session.id);
    await pay(two.id, session.id);
    await update(session.id, { joinUrl: ZOOM_A });

    expect(await details.send(session.id, { userIds: [one.id] })).toMatchObject({ sent: 1 });
    expect(detailsMailTo(two.email!)).toHaveLength(0);

    const order = await prisma.order.findFirstOrThrow({ where: { userId: two.id, items: { some: { productId: session.id } } } });
    await payments.refund(order.id, adminId, 'test');
    const overview = await details.overview(session.id);
    expect(overview.rows.map((r) => r.userId)).toEqual([one.id]);
  });

  it('never shows the Telegram link on the public page', async () => {
    const session = await createSession({ joinUrl: ZOOM_A, telegramUrl: TELEGRAM });
    const view = await sessions.publicBySlug(session.slug);
    const json = JSON.stringify(view, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
    expect(json).not.toContain('t.me');
    expect((await sessions.getForAdmin(session.id)).telegramUrl).toBe(TELEGRAM);
  });
});
