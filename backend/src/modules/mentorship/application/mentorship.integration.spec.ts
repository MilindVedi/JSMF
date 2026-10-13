import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AccessType,
  EntitlementStatus,
  MentorshipBookingStatus,
  OrderStatus,
  ProductStatus,
  ProductType,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OrderEvents } from '../../orders/application/order-events';
import { OrderService } from '../../orders/application/order.service';
import { PaymentService } from '../../orders/application/payment.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { MentorshipBookingService, isOverlap } from './mentorship-booking.service';
import { MentorshipMailer } from './mentorship-mailer.service';
import { MentorshipOfferingService } from './mentorship-offering.service';
import { MentorshipScheduleService } from './mentorship-schedule.service';

/**
 * One-to-one bookings against a real Postgres, through the real checkout and
 * the real settlement path (stub payment driver, signed webhooks).
 *
 * Real where it matters: the exclusion constraint that refuses double
 * bookings, the order and payment rows, OrderEvents wiring. Mail is captured,
 * not sent. Requires the dev stack. Everything created is deleted by id.
 */

const settings: Record<string, unknown> = {
  STUB_PAYMENT_SECRET: 'test-stub-secret-at-least-16-chars',
  STOREFRONT_URL: 'http://localhost:3001',
  MAIN_WEBSITE_URL: 'http://localhost:3002',
  ADMIN_APP_URL: 'http://localhost:3001',
  MAIL_REPLY_TO: 'support@jsmf.me',
  MENTORSHIP_HOLD_MINUTES: 20,
  MENTORSHIP_REMINDER_LEAD_MINUTES: 60,
  MENTORSHIP_ADMIN_NOTIFY_EMAIL: 'alerts@jsmf.test',
};
const config = { get: (key: string) => settings[key] } as never;

const sent: Array<{ to: { email: string }; subject: string; tag?: string }> = [];
const mail = {
  sendBestEffort(request: { to: { email: string }; subject: string; tag?: string }) {
    sent.push(request);
    return Promise.resolve({ delivered: true as const, messageId: 'test' });
  },
} as never;
const whatsapp = { enabled: () => false, send: () => Promise.resolve({ delivered: false, reason: 'error' }) } as never;

const prisma = new PrismaService();
const provider = new StubPaymentAdapter(config);
const entitlements = new EntitlementService(prisma);
const orders = new OrderService(prisma, provider, entitlements);
const events = new OrderEvents();
const payments = new PaymentService(prisma, provider, entitlements, mail, whatsapp, config, events);
const audit = new AuditService(prisma);
const offerings = new MentorshipOfferingService(prisma, {} as never, audit);
const schedule = new MentorshipScheduleService(prisma);
const sweeps = new SweepRegistry();
const mailer = new MentorshipMailer(mail, config);
const bookings = new MentorshipBookingService(
  prisma,
  offerings,
  schedule,
  orders,
  events,
  sweeps,
  mailer,
  audit,
  config,
);

const created = { userIds: [] as string[], productId: '' };
const actor = { id: '', ip: '127.0.0.1' };
let slug: string;
let alice: string;
let bob: string;

const answers = (overrides: Partial<{ startsAt: string }> = {}) => ({
  startsAt: '',
  attendeeName: 'Test Attendee',
  whatsappNumber: '+919876543210',
  exam: 'NEET-PG',
  notes: 'Mock scores stuck',
  ...overrides,
});

async function user(name: string) {
  const row = await prisma.user.create({
    data: { email: `mentor-spec-${randomUUID()}@jsmf.test`, name, status: UserStatus.ACTIVE },
  });
  created.userIds.push(row.id);
  return row.id;
}

/** The open slots right now, so tests never depend on the wall clock. */
async function openStarts(): Promise<string[]> {
  const result = await bookings.publicSlots(slug, {});
  return result.slots.map((s) => s.startsAt);
}

/** Pays an order the ordinary way: one signed webhook through settlement. */
async function pay(hold: { providerOrderId?: string; amountMinor?: bigint }) {
  const delivery = provider.simulateWebhook({
    providerOrderId: hold.providerOrderId!,
    amountMinor: hold.amountMinor!,
    providerPaymentId: `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
  });
  await payments.handleWebhook(delivery.rawBody, delivery.headers);
}

async function holdAndPay(userId: string, startsAt: string) {
  const hold = await bookings.hold(userId, slug, answers({ startsAt }));
  if (hold.kind !== 'PAYMENT_REQUIRED') throw new Error('expected a paid checkout');
  await pay(hold);
  return hold;
}

const status = async (bookingId: string) =>
  (await prisma.mentorshipBooking.findUniqueOrThrow({ where: { id: bookingId } })).status;

beforeAll(async () => {
  await prisma.$connect();
  bookings.onModuleInit();

  alice = await user('Alice');
  bob = await user('Bob');
  actor.id = alice;

  slug = `mentorship-spec-${randomUUID()}`;
  const product = await prisma.product.create({
    data: {
      slug,
      title: 'Spec 1:1',
      type: ProductType.MENTORSHIP,
      accessType: AccessType.PAID,
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      priceAmountMinor: 99900n,
      currency: 'INR',
    },
  });
  created.productId = product.id;

  await prisma.mentorshipOffering.create({
    data: {
      productId: product.id,
      durationMinutes: 45,
      bufferMinutes: 15,
      minNoticeMinutes: 0,
      bookingWindowDays: 10,
      rescheduleCutoffMinutes: 24 * 60,
      maxReschedules: 1,
      // Open all day, every day: a slot every hour on the hour (IST).
      rules: { create: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })) },
    },
  });
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  const orderRows = await prisma.order.findMany({ where: { userId: { in: created.userIds } }, select: { id: true } });
  const orderIds = orderRows.map((o) => o.id);
  await prisma.mentorshipBooking.deleteMany({ where: { offeringId: created.productId } });
  await prisma.entitlement.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: created.productId } });
  await prisma.mentorshipOffering.deleteMany({ where: { productId: created.productId } });
  await prisma.product.deleteMany({ where: { id: created.productId } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: created.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
});

describe('holding and paying', () => {
  it('refuses a time that is not one of the offered slots', async () => {
    const [first] = await openStarts();
    const offGrid = new Date(new Date(first).getTime() + 30 * 60_000).toISOString();
    await expect(bookings.hold(alice, slug, answers({ startsAt: offGrid }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('confirms on payment, sends one confirmation and one admin alert, and grants no library item', async () => {
    const starts = await openStarts();
    const hold = await holdAndPay(alice, starts[3]);

    expect(await status(hold.bookingId)).toBe(MentorshipBookingStatus.CONFIRMED);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: hold.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);

    expect(sent.filter((m) => m.tag === 'mentorship-confirmation')).toHaveLength(1);
    expect(sent.filter((m) => m.tag === 'mentorship-admin-booked')).toHaveLength(1);
    // The generic receipt is skipped: one email to the buyer, not two.
    expect(sent.filter((m) => m.tag !== 'mentorship-admin-booked')).toHaveLength(1);

    const owned = await prisma.entitlement.count({ where: { userId: alice, productId: created.productId } });
    expect(owned).toBe(0);
    // The time is no longer offered.
    expect(await openStarts()).not.toContain(starts[3]);
  });

  it('lets the same person book a second call (a call is not "owned")', async () => {
    const starts = await openStarts();
    const hold = await holdAndPay(alice, starts[6]);
    expect(await status(hold.bookingId)).toBe(MentorshipBookingStatus.CONFIRMED);
  });

  it('gives a contested slot to exactly one of two simultaneous buyers', async () => {
    const [target] = (await openStarts()).slice(10, 11);
    const results = await Promise.allSettled([
      bookings.hold(alice, slug, answers({ startsAt: target })),
      bookings.hold(bob, slug, answers({ startsAt: target })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
  });

  it('replaces a person\'s earlier unpaid hold when they pick another time', async () => {
    const starts = await openStarts();
    const first = await bookings.hold(bob, slug, answers({ startsAt: starts[12] }));
    const second = await bookings.hold(bob, slug, answers({ startsAt: starts[13] }));
    expect(await status(first.bookingId)).toBe(MentorshipBookingStatus.EXPIRED);
    expect(await status(second.bookingId)).toBe(MentorshipBookingStatus.PENDING_PAYMENT);
    expect(await openStarts()).toContain(starts[12]);
  });

  it('still confirms a late payment when nobody took the time meanwhile', async () => {
    const starts = await openStarts();
    const hold = await bookings.hold(alice, slug, answers({ startsAt: starts[15] }));
    await prisma.mentorshipBooking.update({ where: { id: hold.bookingId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await bookings.sweep(); // marks it EXPIRED
    expect(await status(hold.bookingId)).toBe(MentorshipBookingStatus.EXPIRED);

    await pay(hold);
    expect(await status(hold.bookingId)).toBe(MentorshipBookingStatus.CONFIRMED);
  });

  it('flags a late payment whose time was taken, and tells both the buyer and the admin', async () => {
    const starts = await openStarts();
    const late = await bookings.hold(alice, slug, answers({ startsAt: starts[17] }));
    await prisma.mentorshipBooking.update({ where: { id: late.bookingId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    await holdAndPay(bob, starts[17]); // Bob takes the lapsed time and pays
    sent.length = 0;

    await pay(late);
    expect(await status(late.bookingId)).toBe(MentorshipBookingStatus.PAID_UNSCHEDULED);
    expect(sent.map((m) => m.tag)).toEqual(['mentorship-paid-unscheduled', 'mentorship-admin-needs_attention']);

    // An admin gives it a new time; it becomes a normal confirmed call.
    const free = (await openStarts())[20];
    const fixed = await bookings.adminReschedule(late.bookingId, free, actor);
    expect(fixed.status).toBe(MentorshipBookingStatus.CONFIRMED);
  });

  it('cancels the booking and frees its time when the order is refunded', async () => {
    const starts = await openStarts();
    const hold = await holdAndPay(bob, starts[22]);

    await payments.refund(hold.orderId, alice, 'spec refund');
    expect(await status(hold.bookingId)).toBe(MentorshipBookingStatus.CANCELLED);
    expect(await openStarts()).toContain(starts[22]);
  });
});

describe('the database guard itself', () => {
  it('refuses an overlapping active booking even when written directly, and is recognised as one', async () => {
    const taken = await prisma.mentorshipBooking.findFirstOrThrow({
      where: { offeringId: created.productId, status: MentorshipBookingStatus.CONFIRMED },
    });
    const error = await prisma.mentorshipBooking
      .create({
        data: {
          offeringId: created.productId,
          userId: bob,
          status: MentorshipBookingStatus.CONFIRMED,
          startsAt: new Date(taken.startsAt.getTime() + 10 * 60_000),
          endsAt: new Date(taken.endsAt.getTime() + 10 * 60_000),
          blockedUntil: new Date(taken.blockedUntil.getTime() + 10 * 60_000),
          attendeeName: 'Overlap',
          exam: 'NEET-PG',
        },
      })
      .catch((cause: unknown) => cause);
    expect(isOverlap(error)).toBe(true);
  });
});

describe('the attendee moving their own call', () => {
  it('moves it to another open time, once, and only before the cutoff', async () => {
    const starts = await openStarts();
    // Far enough ahead to be outside the 24-hour cutoff.
    const later = starts.filter((s) => new Date(s).getTime() > Date.now() + 30 * 60 * 60_000);
    const hold = await holdAndPay(alice, later[0]);

    const moved = await bookings.reschedule(alice, hold.bookingId, later[2]);
    expect(moved.startsAt).toBe(later[2]);
    expect(moved.reschedulesLeft).toBe(0);
    expect(await openStarts()).toContain(later[0]);

    // maxReschedules is 1.
    await expect(bookings.reschedule(alice, hold.bookingId, later[4])).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses inside the cutoff', async () => {
    const starts = await openStarts();
    const soon = starts.find((s) => new Date(s).getTime() < Date.now() + 20 * 60 * 60_000)!;
    const hold = await holdAndPay(bob, soon);
    const later = starts.filter((s) => new Date(s).getTime() > Date.now() + 30 * 60 * 60_000);
    await expect(bookings.reschedule(bob, hold.bookingId, later[6])).rejects.toBeInstanceOf(ConflictException);
  });

  it('never shows or moves someone else\'s booking', async () => {
    const [mine] = await bookings.mine(alice);
    await expect(bookings.myBooking(bob, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(bookings.reschedule(bob, mine.id, (await openStarts())[30])).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('the joining link and the reminder', () => {
  it('emails the link when an admin sets it, and reminds once inside the lead time', async () => {
    // Book any slot, then have an admin move it to 30 minutes from now —
    // deterministic whatever minute of the hour the suite runs at.
    const starts = await openStarts();
    const hold = await holdAndPay(alice, starts[50]);
    // Earlier tests may hold the next couple of hours of this test offering;
    // clear them so the guard does not (correctly) refuse the move below.
    await prisma.mentorshipBooking.updateMany({
      where: {
        offeringId: created.productId,
        id: { not: hold.bookingId },
        status: { in: [MentorshipBookingStatus.CONFIRMED, MentorshipBookingStatus.PENDING_PAYMENT] },
        startsAt: { lt: new Date(Date.now() + 3 * 60 * 60_000) },
      },
      data: { status: MentorshipBookingStatus.CANCELLED, holdExpiresAt: null },
    });
    const inThirty = new Date(Math.ceil((Date.now() + 30 * 60_000) / 60_000) * 60_000).toISOString();
    await bookings.adminReschedule(hold.bookingId, inThirty, actor);
    sent.length = 0;

    // No link yet: the reminder waits.
    expect((await bookings.sweep()).reminders).toBe(0);

    await bookings.setMeetUrl(hold.bookingId, 'https://meet.google.com/abc-defg-hij', actor);
    expect(sent.map((m) => m.tag)).toEqual(['mentorship-meet-link']);

    const first = await bookings.sweep();
    const second = await bookings.sweep();
    expect(first.reminders).toBe(1);
    expect(second.reminders).toBe(0);
  });

  it('keeps the link out of other people\'s and past responses', async () => {
    const all = await bookings.mine(bob);
    for (const booking of all) {
      if (booking.status !== MentorshipBookingStatus.CONFIRMED) expect(booking.meetUrl).toBeNull();
    }
  });
});

describe('admin statuses', () => {
  it('refuses to mark a call completed before it starts', async () => {
    const starts = await openStarts();
    const hold = await holdAndPay(bob, starts[40]);
    await expect(bookings.setStatus(hold.bookingId, 'COMPLETED', null, false, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('cancels without a refund and frees the time', async () => {
    const starts = await openStarts();
    const hold = await holdAndPay(bob, starts[42]);
    sent.length = 0;
    await bookings.setStatus(hold.bookingId, 'CANCELLED', 'Dr. Angad is unwell', true, actor);
    expect(await status(hold.bookingId)).toBe(MentorshipBookingStatus.CANCELLED);
    expect(sent.map((m) => m.tag)).toEqual(['mentorship-cancelled']);
    expect(await openStarts()).toContain(starts[42]);
    // The payment is untouched: refunding stays a deliberate, separate step.
    const order = await prisma.order.findUniqueOrThrow({ where: { id: hold.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);
  });

  it('never leaves an entitlement behind for a call', async () => {
    const count = await prisma.entitlement.count({
      where: { productId: created.productId, status: EntitlementStatus.ACTIVE },
    });
    expect(count).toBe(0);
  });
});
