import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessType,
  EntitlementSource,
  ProductStatus,
  ProductType,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ProductService } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OrderEvents } from '../../orders/application/order-events';
import { OrderService } from '../../orders/application/order.service';
import { PaymentService } from '../../orders/application/payment.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { LiveSessionNotifications } from './live-session-notifications.service';
import { LiveSessionService } from './live-session.service';

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
const sessions = new LiveSessionService(prisma, products, orders, entitlements, audit);
const notifications = new LiveSessionNotifications(prisma, mail, config, events);
notifications.onModuleInit();

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

async function createSession(overrides: { capacity?: number | null } = {}) {
  const session = await sessions.create(
    {
      title: `Session spec ${randomUUID().slice(0, 8)}`,
      tagline: 'A test session',
      startsAt: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(),
      durationMinutes: 90,
      platformLabel: 'Live on Zoom',
      capacity: overrides.capacity ?? null,
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
  await prisma.sessionRegistration.deleteMany({ where: { liveSessionId: { in: productIds } } });
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

    await prisma.liveSession.update({
      where: { productId: session.id },
      data: { startsAt: new Date(Date.now() + 30 * 60_000), joinUrl: null },
    });

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
  });
});
