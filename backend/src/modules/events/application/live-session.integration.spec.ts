import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessType,
  BundleDeliveryMode,
  EntitlementSource,
  EntitlementStatus,
  ProductStatus,
  ProductType,
  UserStatus,
} from '@prisma/client';
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
 * Live sessions against a real Postgres, wired by hand for the same reason as
 * the payment spec (Vitest cannot run Nest's decorator-metadata injection).
 *
 * The properties that matter are money-shaped: a paid seat is an entitlement,
 * the planner comes with it, a refund takes both back and frees the seat, and
 * the buyer gets exactly one email. Every row is created here and deleted by
 * its own id.
 */

const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') {
      return process.env.STUB_PAYMENT_SECRET ?? 'test-stub-secret-at-least-16-chars';
    }
    if (key === 'STOREFRONT_URL') return 'http://localhost:3001';
    if (key === 'SESSION_REMINDER_LEAD_MINUTES') return 60;
    return process.env[key];
  },
} as never;

const sentMail: Array<{ to: { email: string }; subject: string; text: string; tag?: string }> = [];
const mail = {
  sendBestEffort(request: (typeof sentMail)[number]) {
    sentMail.push(request);
    return Promise.resolve({ delivered: true as const, messageId: 'test' });
  },
} as never;
const whatsapp = { enabled: () => false, send: () => Promise.resolve({ delivered: true }) } as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const provider = new StubPaymentAdapter(config);
const entitlements = new EntitlementService(prisma);
const events = new OrderEvents();
const products = new ProductService(prisma, audit);
const orders = new OrderService(prisma, provider, entitlements);
const payments = new PaymentService(prisma, provider, entitlements, mail, whatsapp, config, events);
/** Testimonials are the only thing here that touches storage, and none of these tests upload one. */
const storage = {
  getSignedDownloadUrl: () => Promise.resolve('https://example.test/testimonial.png'),
} as never;
const sessions = new LiveSessionService(prisma, products, orders, entitlements, audit, storage, config);
const details = new SessionDetailsService(prisma, mail);
const notifications = new LiveSessionNotifications(prisma, mail, config, events, entitlements, details);
notifications.onModuleInit();
const offlineHandlers = new OfflineSaleHandlers();
new SessionOfflineSaleHandler(prisma, offlineHandlers, config).onModuleInit();
const offline = new OfflineSaleService(prisma, entitlements, offlineHandlers, audit);

const created = { userIds: [] as string[], productIds: [] as string[] };
const PRICE = 9900n;
const answers = { whatsappNumber: '98765 43210', exam: 'NEET-PG', stage: 'Intern' };

let adminId: string;
let plannerId: string;

async function createUser(email: string | null = `session-spec-${randomUUID()}@jsmf.test`) {
  const user = await prisma.user.create({
    data: {
      email,
      phone: email ? null : `9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
      name: 'Session Spec Person',
      status: UserStatus.ACTIVE,
    },
  });
  created.userIds.push(user.id);
  return user;
}

const HOUR = 3600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

async function createSession(
  overrides: {
    capacity?: number | null;
    days?: Array<{ startsAt: string; durationMinutes: number }>;
    bundleDeliveryMode?: BundleDeliveryMode;
    lateRegistration?: boolean;
  } = {},
) {
  const session = await sessions.create(
    {
      title: `Session spec ${randomUUID().slice(0, 8)}`,
      tagline: 'A test session',
      days: overrides.days ?? [{ startsAt: inHours(48), durationMinutes: 90 }],
      platformLabel: 'Live on Zoom',
      capacity: overrides.capacity ?? null,
      bundleDeliveryMode: overrides.bundleDeliveryMode,
      lateRegistration: overrides.lateRegistration,
      priceAmountMinor: PRICE.toString(),
      highlights: ['One', 'Two'],
      perkText: 'Free planner',
      includedProductIds: [plannerId],
    },
    { id: adminId },
  );
  created.productIds.push(session.id);
  await sessions.publish(session.id, { id: adminId });
  return session;
}

/** Registers and pays with one capture webhook — the ordinary path. */
async function registerAndPay(userId: string, sessionId: string) {
  const checkout = await sessions.register(userId, sessionId, answers);
  if (checkout.kind !== 'PAYMENT_REQUIRED') throw new Error('sessions are always paid');

  const delivery = provider.simulateWebhook({
    providerOrderId: checkout.providerOrderId,
    amountMinor: PRICE,
  });
  await payments.handleWebhook(delivery.rawBody, delivery.headers);
  return checkout;
}

beforeAll(async () => {
  await prisma.$connect();
  adminId = (await createUser()).id;

  const planner = await prisma.product.create({
    data: {
      slug: `session-spec-planner-${randomUUID()}`,
      title: 'Revision Planner',
      type: ProductType.PDF,
      accessType: AccessType.PAID,
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      priceAmountMinor: 19900n,
    },
  });
  plannerId = planner.id;
  created.productIds.push(planner.id);
});

afterAll(async () => {
  const productIds = created.productIds;
  await prisma.sessionDayReminder.deleteMany({ where: { day: { liveSessionId: { in: productIds } } } });
  await prisma.sessionBundleDelivery.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionDateAnnouncement.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionDetailReceipt.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionDetailEmail.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.offlineSale.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.sessionRegistration.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSessionDay.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.productBundleItem.deleteMany({ where: { bundleProductId: { in: productIds } } });
  await prisma.liveSession.deleteMany({ where: { productId: { in: productIds } } });

  for (const id of created.userIds) {
    await prisma.entitlement.deleteMany({ where: { userId: id } });
    const orderIds = (await prisma.order.findMany({ where: { userId: id }, select: { id: true } })).map(
      (o) => o.id,
    );
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }

  await prisma.auditLog.deleteMany({ where: { entityId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: created.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
});

describe('live sessions', () => {
  it('publishes without a file and never exposes the joining link publicly', async () => {
    const session = await createSession();
    await sessions.update(session.id, { joinUrl: 'https://zoom.us/j/secret' }, { id: adminId });

    const view = await sessions.publicBySlug(session.slug);
    expect(view.registrationOpen).toBe(true);
    expect(view.included).toEqual([{ title: 'Revision Planner' }]);
    expect(JSON.stringify(view, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain('zoom.us');
  });

  it('stays out of the PDF storefront and its generic checkout', async () => {
    const session = await createSession();
    const buyer = await createUser();

    const browse = await products.findPublic({ pageSize: 100 });
    expect(browse.items.some((p) => p.id === session.id)).toBe(false);

    await expect(
      orders.checkout({ userId: buyer.id, productId: session.id, customerEmail: buyer.email }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('grants the seat and the planner on payment, with one confirmation email', async () => {
    const session = await createSession();
    const buyer = await createUser();
    sentMail.length = 0;

    await registerAndPay(buyer.id, session.id);

    const seat = await entitlements.findActive(buyer.id, session.id);
    const planner = await entitlements.findActive(buyer.id, plannerId);
    expect(seat?.source).toBe(EntitlementSource.PURCHASE);
    expect(planner?.source).toBe(EntitlementSource.BUNDLE);
    expect(planner?.sourceProductId).toBe(session.id);

    expect(sentMail.map((m) => m.tag)).toEqual(['session-confirmation']);
    // Granted at payment, so the confirmation may truthfully say so.
    expect(sentMail[0].text).toContain('now in your JSMF library');

    const registration = await prisma.sessionRegistration.findUniqueOrThrow({
      where: { liveSessionId_userId: { liveSessionId: session.id, userId: buyer.id } },
    });
    expect(registration.whatsappNumber).toBe('919876543210');
    expect(registration.confirmationSentAt).not.toBeNull();

    // The seat is not a file, so it stays out of the store library; the planner is.
    const library = await entitlements.listForUser(buyer.id);
    expect(library.map((e) => e.productId)).toEqual([plannerId]);

    await expect(sessions.register(buyer.id, session.id, answers)).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a seat once capacity is taken, and a refund frees it', async () => {
    const session = await createSession({ capacity: 1 });
    const first = await createUser();
    const second = await createUser();

    const checkout = await registerAndPay(first.id, session.id);
    expect((await sessions.publicBySlug(session.slug)).seatsRemaining).toBe(0);
    await expect(sessions.register(second.id, session.id, answers)).rejects.toMatchObject({ status: 409 });

    await payments.refund(checkout.orderId, adminId, 'test');

    expect(await entitlements.findActive(first.id, session.id)).toBeNull();
    expect(await entitlements.findActive(first.id, plannerId)).toBeNull();
    expect((await sessions.publicBySlug(session.slug)).seatsRemaining).toBe(1);
  });

  it('refuses an account without an email, and registration after the start', async () => {
    const session = await createSession();
    const mobileOnly = await createUser(null);
    await expect(sessions.register(mobileOnly.id, session.id, answers)).rejects.toMatchObject({ status: 400 });

    const buyer = await createUser();
    await prisma.liveSession.update({
      where: { productId: session.id },
      data: { startsAt: new Date(Date.now() - 60_000) },
    });
    await expect(sessions.register(buyer.id, session.id, answers)).rejects.toMatchObject({ status: 409 });
  });

  it('holds reminders until there is a link, then sends each exactly once', async () => {
    const session = await createSession();
    const buyer = await createUser();
    const bystander = await createUser();
    await registerAndPay(buyer.id, session.id);
    // Registered but never paid: must not be reminded.
    await sessions.register(bystander.id, session.id, answers);

    await sessions.update(
      session.id,
      { days: [{ startsAt: inHours(0.5), durationMinutes: 90 }], joinUrl: null },
      { id: adminId },
    );

    sentMail.length = 0;
    await notifications.sendDueReminders();
    expect(sentMail).toHaveLength(0);

    await sessions.update(session.id, { joinUrl: 'https://zoom.us/j/123' }, { id: adminId });
    await notifications.sendDueReminders();
    await notifications.sendDueReminders();

    const reminders = sentMail.filter((m) => m.tag === 'session-reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0].to.email).toBe(buyer.email);
    expect(reminders[0].text).toContain('https://zoom.us/j/123');
    expect(reminders[0].subject).not.toContain('Day 1');
  });

  it('stores multi-day sessions in day order and lists every day in the confirmation', async () => {
    const session = await createSession({
      days: [
        { startsAt: inHours(72), durationMinutes: 60 },
        { startsAt: inHours(24), durationMinutes: 90 },
        { startsAt: inHours(48), durationMinutes: 120 },
      ],
    });

    expect(session.days.map((d) => d.durationMinutes)).toEqual([90, 120, 60]);
    expect(new Date(session.startsAt!).getTime()).toBe(new Date(session.days[0].startsAt).getTime());

    const buyer = await createUser();
    sentMail.length = 0;
    await registerAndPay(buyer.id, session.id);

    const [confirmation] = sentMail;
    expect(confirmation.text).toContain('for all 3 days');
    expect(confirmation.text).toContain('Day 1 ·');
    expect(confirmation.text).toContain('Day 3 ·');
  });

  it('refuses days that overlap', async () => {
    await expect(
      createSession({
        days: [
          { startsAt: inHours(24), durationMinutes: 120 },
          { startsAt: inHours(25), durationMinutes: 60 },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('reminds before each day, once, and again for a day that is rescheduled', async () => {
    const session = await createSession({
      days: [
        { startsAt: inHours(0.5), durationMinutes: 20 },
        { startsAt: inHours(24), durationMinutes: 60 },
      ],
    });
    await sessions.update(session.id, { joinUrl: 'https://zoom.us/j/multi' }, { id: adminId });
    const buyer = await createUser();
    await registerAndPay(buyer.id, session.id);
    const [day1, day2] = session.days;

    const reminded = () => sentMail.filter((m) => m.tag === 'session-reminder').map((m) => m.subject);

    sentMail.length = 0;
    await notifications.sendDueReminders();
    await notifications.sendDueReminders();
    expect(reminded()).toEqual([expect.stringContaining('Day 1 of 2')]);

    // Day 2 moved to within the lead time: its own reminder, day 1 untouched.
    const day2Soon = inHours(0.9);
    sentMail.length = 0;
    await sessions.update(
      session.id,
      {
        days: [
          { id: day1.id, startsAt: new Date(day1.startsAt).toISOString(), durationMinutes: 20 },
          { id: day2.id, startsAt: day2Soon, durationMinutes: 60 },
        ],
      },
      { id: adminId },
    );
    await notifications.sendDueReminders();
    expect(reminded()).toEqual([expect.stringContaining('Day 2 of 2')]);

    // Day 1 rescheduled: the reminder already sent was for the old time, so it goes again.
    sentMail.length = 0;
    await sessions.update(
      session.id,
      {
        days: [
          { id: day1.id, startsAt: inHours(0.25), durationMinutes: 30 },
          { id: day2.id, startsAt: day2Soon, durationMinutes: 60 },
        ],
      },
      { id: adminId },
    );
    await notifications.sendDueReminders();
    expect(reminded()).toEqual([expect.stringContaining('Day 1 of 2')]);
  });

  it('postpones every day by one day, even when a day moves onto another day\'s old time', async () => {
    const session = await createSession({
      days: [
        { startsAt: inHours(24), durationMinutes: 60 },
        { startsAt: inHours(48), durationMinutes: 60 },
      ],
    });
    const [day1, day2] = session.days;
    const shift = (iso: string | Date) => new Date(new Date(iso).getTime() + 24 * HOUR).toISOString();

    const moved = await sessions.update(
      session.id,
      {
        days: [
          { id: day1.id, startsAt: shift(day1.startsAt), durationMinutes: 60 },
          { id: day2.id, startsAt: shift(day2.startsAt), durationMinutes: 60 },
        ],
      },
      { id: adminId },
    );

    expect(moved.days.map((d) => d.id)).toEqual([day1.id, day2.id]);
    expect(new Date(moved.startsAt!).toISOString()).toBe(shift(day1.startsAt));
  });

  it('sells a session whose dates are not fixed yet, and keeps registration open', async () => {
    const session = await createSession({ days: [] });

    expect(session.startsAt).toBeNull();
    expect(session.days).toEqual([]);

    const view = await sessions.publicBySlug(session.slug);
    // Nothing has started, so nothing has closed.
    expect(view.startsAt).toBeNull();
    expect(view.days).toEqual([]);
    expect(view.registrationOpen).toBe(true);
    expect(view.recordingUrl).toBeNull();

    // An undated session is still upcoming — it has not happened.
    const landing = await sessions.landing();
    expect(landing.previous?.id).not.toBe(session.id);

    const buyer = await createUser();
    await registerAndPay(buyer.id, session.id);
    expect(await entitlements.findActive(buyer.id, session.id)).not.toBeNull();

    // Adding dates later turns it into an ordinary session.
    const dated = await sessions.update(
      session.id,
      { days: [{ startsAt: inHours(72), durationMinutes: 90 }] },
      { id: adminId },
    );
    expect(dated.startsAt).not.toBeNull();

    // And they can be taken away again.
    const undated = await sessions.update(session.id, { days: [] }, { id: adminId });
    expect(undated.startsAt).toBeNull();
  });

  it('holds the planner back until an admin sends it, then never sends it twice', async () => {
    const session = await createSession({ bundleDeliveryMode: BundleDeliveryMode.MANUAL });
    const buyer = await createUser();
    sentMail.length = 0;
    await registerAndPay(buyer.id, session.id);

    // The seat is granted at payment; the planner deliberately is not.
    expect(await entitlements.findActive(buyer.id, session.id)).not.toBeNull();
    expect(await entitlements.findActive(buyer.id, plannerId)).toBeNull();

    // So the confirmation must not claim it is already in their library.
    const confirmation = sentMail.find((m) => m.tag === 'session-confirmation');
    expect(confirmation).toBeDefined();
    expect(confirmation!.text).not.toContain('in your JSMF library');

    // Too early: the session has not finished.
    await expect(notifications.releaseBundle(session.id)).rejects.toThrow(/not finished/i);

    // Move it into the past, as if it had been run.
    await prisma.liveSessionDay.updateMany({
      where: { liveSessionId: session.id },
      data: { startsAt: new Date(Date.now() - 4 * HOUR) },
    });
    await prisma.liveSession.update({
      where: { productId: session.id },
      data: { startsAt: new Date(Date.now() - 4 * HOUR) },
    });

    sentMail.length = 0;
    const first = await notifications.releaseBundle(session.id);

    expect(first).toMatchObject({ attempted: 1, sent: 1, failed: [] });
    expect(await entitlements.findActive(buyer.id, plannerId)).not.toBeNull();

    const ready = sentMail.filter((m) => m.tag === 'session-bundle-ready');
    expect(ready).toHaveLength(1);
    expect(ready[0].to.email).toBe(buyer.email);
    expect(ready[0].text).toContain('Revision Planner');

    const listed = await notifications.listBundleDeliveries(session.id);
    expect(listed.blocker).toBeNull();
    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]).toMatchObject({ userId: buyer.id, status: 'SENT', lastError: null });

    // Sending again reaches nobody: already-sent buyers are skipped, so a
    // second click cannot email the same person twice.
    sentMail.length = 0;
    const second = await notifications.releaseBundle(session.id);
    expect(second).toMatchObject({ attempted: 0, sent: 0, failed: [] });
    expect(sentMail.filter((m) => m.tag === 'session-bundle-ready')).toHaveLength(0);
  });

  // The reminder sweep covers every session in the database, so the specs that
  // need it live here, in the one file that runs it.
  it('reminds a buyer added by hand like any other, and the reminder counts as their joining link', async () => {
    const session = await createSession({ days: [{ startsAt: inHours(0.5), durationMinutes: 60 }] });
    await sessions.update(session.id, { joinUrl: 'https://zoom.us/j/offline-reminded' }, { id: adminId });
    const email = `session-spec-offline-${randomUUID()}@jsmf.test`;
    const row = {
      name: 'Offline Reminded',
      email,
      amountPaidMinor: '9900',
      method: 'UPI_DIRECT',
      paidAt: new Date(Date.now() - HOUR).toISOString(),
    };

    const preview = await offline.preview(session.id, [row]);
    expect(preview.warnings.join(' ')).toMatch(/reminder/);
    await offline.record(session.id, [row], { userId: adminId, entry: 'FORM' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    created.userIds.push(user.id);

    const before = (await details.overview(session.id)).rows.find((r) => r.userId === user.id)!;
    expect(before.statuses.join_link).toBe('NOT_SENT');

    sentMail.length = 0;
    await notifications.sendDueReminders();
    expect(sentMail.some((m) => m.to.email === email && m.tag === 'session-reminder')).toBe(true);

    const after = (await details.overview(session.id)).rows.find((r) => r.userId === user.id)!;
    expect(after.statuses.join_link).toBe('UP_TO_DATE');
    expect(after.outstanding).toEqual(['dates']);
  });

  it('keeps a started multi-day session on sale while late registration is on', async () => {
    // Day 1 is already running; day 2 is tomorrow. Exactly the case the flag is
    // for: the session has begun but is not over.
    const days = [
      { startsAt: inHours(-2), durationMinutes: 60 },
      { startsAt: inHours(24), durationMinutes: 60 },
    ];
    const open = await createSession({ days: [{ startsAt: inHours(48), durationMinutes: 60 }], lateRegistration: true });
    await sessions.update(open.id, { days }, { id: adminId });

    const closed = await createSession({ days: [{ startsAt: inHours(48), durationMinutes: 60 }] });
    await sessions.update(closed.id, { days }, { id: adminId });

    const openView = await sessions.publicBySlug((await sessions.getForAdmin(open.id)).slug);
    expect(openView.registrationOpen).toBe(true);
    // Nothing is offered as a recording while the session is still running.
    expect(openView.recordingUrl).toBeNull();

    const closedView = await sessions.publicBySlug((await sessions.getForAdmin(closed.id)).slug);
    expect(closedView.registrationOpen).toBe(false);

    const buyer = await createUser();
    await expect(sessions.register(buyer.id, open.id, answers)).resolves.toBeDefined();
    await expect(sessions.register((await createUser()).id, closed.id, answers)).rejects.toThrow(
      /closed/i,
    );

    // Once the last day has ended the flag stops mattering: it closes anyway.
    await sessions.update(open.id, { days: [{ startsAt: inHours(-4), durationMinutes: 60 }] }, { id: adminId });
    const after = await sessions.publicBySlug((await sessions.getForAdmin(open.id)).slug);
    expect(after.registrationOpen).toBe(false);
  });

  it('refunding a deferred session takes the planner back with the seat', async () => {
    const session = await createSession({ bundleDeliveryMode: BundleDeliveryMode.AUTO_AFTER_SESSION });
    const buyer = await createUser();
    const checkout = await registerAndPay(buyer.id, session.id);

    await prisma.liveSessionDay.updateMany({
      where: { liveSessionId: session.id },
      data: { startsAt: new Date(Date.now() - 4 * HOUR) },
    });
    await prisma.liveSession.update({
      where: { productId: session.id },
      data: { startsAt: new Date(Date.now() - 4 * HOUR) },
    });

    // The automatic sweep is the one that releases this mode.
    await notifications.sweepAutoBundleReleases();
    expect(await entitlements.findActive(buyer.id, plannerId)).not.toBeNull();

    await payments.refund(checkout.orderId, adminId, 'Spec refund');

    // Granted late, but still carrying the order — so a refund still takes it.
    expect(await entitlements.findActive(buyer.id, session.id)).toBeNull();
    expect(await entitlements.findActive(buyer.id, plannerId)).toBeNull();

    const revoked = await prisma.entitlement.findFirst({
      where: { userId: buyer.id, productId: plannerId },
    });
    expect(revoked?.status).toBe(EntitlementStatus.REVOKED);
  });
});
