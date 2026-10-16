import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessType,
  BundleDeliveryMode,
  EntitlementSource,
  EntitlementStatus,
  OfflinePaymentMethod,
  OfflineSaleEntry,
  OrderStatus,
  PaymentProvider,
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
 * Buyers who paid outside checkout, recorded by an admin into a live session —
 * against a real Postgres, wired by hand like the other integration specs.
 *
 * What matters: they become ordinary buyers (order, payment, seat, planner,
 * registration — all dated at the real payment), the discount is kept, nobody
 * is emailed on the spot, the regular reminder still reaches them, a list with
 * one mistake writes nothing, and a list sent twice adds nobody twice.
 */

const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') return 'test-stub-secret-at-least-16-chars';
    if (key === 'STOREFRONT_URL') return 'http://localhost:3001';
    if (key === 'SESSION_REMINDER_LEAD_MINUTES') return 60;
    return process.env[key];
  },
} as never;

const sentMail: Array<{ to: { email: string }; subject: string; tag?: string }> = [];
const mail = {
  sendBestEffort(request: (typeof sentMail)[number]) {
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
const notifications = new LiveSessionNotifications(prisma, mail, config, events, entitlements, new SessionDetailsService(prisma, mail));
notifications.onModuleInit();
const handlers = new OfflineSaleHandlers();
new SessionOfflineSaleHandler(prisma, handlers, config).onModuleInit();
const sales = new OfflineSaleService(prisma, entitlements, handlers, audit);

const tag = randomUUID().slice(0, 8);
const created = { userIds: [] as string[], productIds: [] as string[], emails: [] as string[] };
const PRICE = 149900n;
let adminId: string;
let plannerId: string;

const email = (label: string) => {
  const address = `offline-${label}-${tag}@jsmf.test`;
  created.emails.push(address);
  return address;
};

const HOUR = 3600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const admin = () => ({ userId: adminId, ip: '127.0.0.1', entry: OfflineSaleEntry.FORM });

function buyer(label: string, overrides: Record<string, unknown> = {}) {
  return {
    name: `Buyer ${label}`,
    email: email(label),
    whatsappNumber: '+919876543210',
    amountPaidMinor: '129900',
    discountMinor: '20000',
    method: 'UPI_DIRECT',
    reference: 'UTR-1',
    note: 'Paid on WhatsApp',
    paidAt: '2026-10-08T09:15:00+05:30',
    ...overrides,
  };
}

async function createSession(
  overrides: { capacity?: number | null; days?: Array<{ startsAt: string; durationMinutes: number }>; bundleDeliveryMode?: BundleDeliveryMode } = {},
) {
  const session = await sessions.create(
    {
      title: `Offline spec ${randomUUID().slice(0, 8)}`,
      tagline: 'A test session',
      days: overrides.days ?? [{ startsAt: inHours(48), durationMinutes: 90 }],
      platformLabel: 'Live on Zoom',
      capacity: overrides.capacity ?? null,
      bundleDeliveryMode: overrides.bundleDeliveryMode,
      priceAmountMinor: PRICE.toString(),
      highlights: ['One'],
      includedProductIds: [plannerId],
    },
    { id: adminId },
  );
  created.productIds.push(session.id);
  await sessions.publish(session.id, { id: adminId });
  return session;
}

async function userByEmail(address: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: address } });
  if (!created.userIds.includes(user.id)) created.userIds.push(user.id);
  return user;
}

beforeAll(async () => {
  await prisma.$connect();
  const adminUser = await prisma.user.create({
    data: { email: email('admin'), name: 'Offline Spec Admin', status: UserStatus.ACTIVE },
  });
  adminId = adminUser.id;
  created.userIds.push(adminId);

  const planner = await prisma.product.create({
    data: {
      slug: `offline-spec-planner-${randomUUID()}`,
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
  const users = await prisma.user.findMany({ where: { email: { in: created.emails } }, select: { id: true } });
  const userIds = [...new Set([...created.userIds, ...users.map((u) => u.id)])];
  const productIds = created.productIds;

  await prisma.offlineSale.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.sessionDayReminder.deleteMany({ where: { day: { liveSessionId: { in: productIds } } } });
  await prisma.sessionDateAnnouncement.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionDetailReceipt.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionDetailEmail.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionRegistration.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSessionDay.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.productBundleItem.deleteMany({ where: { bundleProductId: { in: productIds } } });
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

describe('offline sales into a live session', () => {
  it('records a new buyer as an ordinary paid seat, dated at the payment, with the discount, and emails nobody', async () => {
    const session = await createSession();
    const mailBefore = sentMail.length;
    const row = buyer('new', { exam: 'NEET-PG' });

    const result = await sales.record(session.id, [row], admin());
    expect(result).toMatchObject({ recorded: [{ index: 0, email: row.email }], skipped: [], failed: [] });
    expect(sentMail.length).toBe(mailBefore);

    const user = await userByEmail(row.email);
    expect(user).toMatchObject({ name: 'Buyer new', emailVerifiedAt: null, contactPhone: '919876543210', phone: null });

    const paidAt = new Date('2026-10-08T03:45:00Z');
    const order = await prisma.order.findFirstOrThrow({
      where: { userId: user.id },
      include: { payments: true, items: true, offlineSale: true },
    });
    expect(order).toMatchObject({
      status: OrderStatus.PAID,
      subtotalAmountMinor: 149900n,
      discountAmountMinor: 20000n,
      totalAmountMinor: 129900n,
      paidAt,
      createdAt: paidAt,
    });
    expect(order.items[0]).toMatchObject({ unitPriceAmountMinor: 149900n, totalAmountMinor: 149900n });
    expect(order.payments[0]).toMatchObject({
      provider: PaymentProvider.OFFLINE,
      providerPaymentId: null,
      amountMinor: 129900n,
      method: 'upi',
      capturedAt: paidAt,
    });
    expect(order.offlineSale).toMatchObject({
      method: OfflinePaymentMethod.UPI_DIRECT,
      reference: 'UTR-1',
      note: 'Paid on WhatsApp',
      entry: OfflineSaleEntry.FORM,
      recordedById: adminId,
      paidAt,
    });

    const seats = await prisma.entitlement.findMany({ where: { userId: user.id, status: EntitlementStatus.ACTIVE } });
    expect(seats.map((s) => [s.productId, s.source, s.grantedAt.toISOString()]).sort()).toEqual(
      [
        [session.id, EntitlementSource.PURCHASE, paidAt.toISOString()],
        [plannerId, EntitlementSource.BUNDLE, paidAt.toISOString()],
      ].sort(),
    );

    const registration = await prisma.sessionRegistration.findFirstOrThrow({
      where: { liveSessionId: session.id, userId: user.id },
    });
    expect(registration).toMatchObject({
      exam: 'NEET-PG',
      stage: '',
      whatsappNumber: '919876543210',
      orderId: order.id,
      createdAt: paidAt,
      confirmationSentAt: paidAt,
    });

    const audited = await prisma.auditLog.count({ where: { action: 'offline_sale.recorded', entityId: order.id } });
    expect(audited).toBe(1);
  });

  it('keeps a Razorpay Payment Page sale refundable by recording its payment id, and refuses that id twice', async () => {
    const session = await createSession();
    const row = buyer('page', { method: 'RAZORPAY_PAYMENT_PAGE', reference: `pay_SPEC${tag}` });

    await sales.record(session.id, [row], admin());
    const user = await userByEmail(row.email);
    const payment = await prisma.payment.findFirstOrThrow({ where: { order: { userId: user.id } } });
    expect(payment).toMatchObject({ provider: PaymentProvider.RAZORPAY, providerPaymentId: `pay_SPEC${tag}` });

    const again = await sales.preview(session.id, [buyer('page-2', { method: 'RAZORPAY_PAYMENT_PAGE', reference: `pay_SPEC${tag}` })]);
    expect(again.errors).toEqual([expect.objectContaining({ index: 0, field: 'reference' })]);

    // The same buyer with the same payment, sent again, is a repeat, not a clash.
    const repeat = await sales.record(session.id, [row], admin());
    expect(repeat).toMatchObject({ recorded: [], skipped: [{ index: 0 }], failed: [] });
  });

  it('refuses a refund through Razorpay for money that never went through it', async () => {
    const session = await createSession();
    const row = buyer('upi-refund');
    await sales.record(session.id, [row], admin());
    const user = await userByEmail(row.email);
    const order = await prisma.order.findFirstOrThrow({ where: { userId: user.id } });

    await expect(payments.refund(order.id, adminId, 'test')).rejects.toMatchObject({ status: 400 });
  });

  it('skips anyone who already has a seat, attaches to an existing account, and keeps a number they typed themselves', async () => {
    const session = await createSession();
    const own = await prisma.user.create({
      data: { email: email('existing'), name: 'Has An Account', contactPhone: '447911123456', status: UserStatus.ACTIVE },
    });
    created.userIds.push(own.id);

    const preview = await sales.preview(session.id, [buyer('existing'), buyer('fresh')]);
    expect(preview.rows.map((r) => [r.email.split('-')[1], r.action, r.existingName])).toEqual([
      ['existing', 'attach', 'Has An Account'],
      ['fresh', 'create', null],
    ]);

    const first = await sales.record(session.id, [buyer('existing'), buyer('fresh')], admin());
    expect(first.recorded).toHaveLength(2);
    expect((await userByEmail(own.email!)).contactPhone).toBe('447911123456');

    // The same list again — after a fix elsewhere, say — adds nobody twice.
    const second = await sales.record(session.id, [buyer('existing'), buyer('fresh')], admin());
    expect(second.recorded).toHaveLength(0);
    expect(second.skipped.map((s) => s.index)).toEqual([0, 1]);
    expect(await prisma.offlineSale.count({ where: { productId: session.id } })).toBe(2);
  });

  it('writes nothing at all when any row has a mistake, and says which', async () => {
    const session = await createSession();
    const rows = [buyer('ok'), buyer('bad-exam', { exam: 'USMLE' }), buyer('typo', { exma: 'FMGE' })];

    await expect(sales.record(session.id, rows, admin())).rejects.toMatchObject({
      status: 400,
      response: {
        errors: [
          expect.objectContaining({ index: 1, field: 'details' }),
          expect.objectContaining({ index: 2, field: 'details' }),
        ],
      },
    });
    expect(await prisma.offlineSale.count({ where: { productId: session.id } })).toBe(0);
    expect(await prisma.user.count({ where: { email: rows[0].email } })).toBe(0);
  });

  it('holds the planner back when the session releases it after it ends', async () => {
    const session = await createSession({ bundleDeliveryMode: BundleDeliveryMode.MANUAL });
    const row = buyer('deferred');
    await sales.record(session.id, [row], admin());
    const user = await userByEmail(row.email);

    const seats = await prisma.entitlement.findMany({ where: { userId: user.id } });
    expect(seats.map((s) => s.productId)).toEqual([session.id]);
  });

  it('warns before going over capacity', async () => {
    const session = await createSession({ capacity: 1 });
    const preview = await sales.preview(session.id, [buyer('cap-1'), buyer('cap-2')]);
    expect(preview.warnings.join(' ')).toMatch(/over its capacity of 1/);
  });

  it('lists who was added by hand, in payment order, with their answers', async () => {
    const session = await createSession();
    await sales.record(
      session.id,
      [
        buyer('later', { paidAt: '2026-10-09T10:00:00+05:30', stage: 'Intern' }),
        buyer('earlier', { paidAt: '2026-10-07T10:00:00+05:30', exam: 'FMGE' }),
      ],
      { userId: null, entry: OfflineSaleEntry.SCRIPT },
    );

    const list = await sales.list(session.id);
    expect(list.map((sale) => [sale.user.name, sale.entry, sale.recordedBy, sale.details])).toEqual([
      ['Buyer earlier', OfflineSaleEntry.SCRIPT, null, { Exam: 'FMGE' }],
      ['Buyer later', OfflineSaleEntry.SCRIPT, null, { Stage: 'Intern' }],
    ]);
    expect(list[0].order).toMatchObject({ listPriceMinor: '149900', discountMinor: '20000', amountPaidMinor: '129900' });
  });

  it('refuses product types that have not opted in', async () => {
    await expect(sales.preview(plannerId, [buyer('pdf')])).rejects.toMatchObject({ status: 400 });
  });
});
