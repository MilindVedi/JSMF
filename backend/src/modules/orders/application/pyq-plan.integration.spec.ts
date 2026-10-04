import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AccessType, EntitlementStatus, ProductStatus, ProductType, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { PyqAccessService } from '../../questions/application/pyq-access.service';
import { PyqPlansService } from '../../questions/application/pyq-plans.service';
import { OrderEvents } from './order-events';
import { OrderService } from './order.service';
import { PaymentService } from './payment.service';

/**
 * PYQ subscription plans bought through the ordinary order/payment path:
 * a plan's purchase stamps an expiry, renewal extends it, refund revokes it,
 * and PyqAccessService reflects all of it. Real Postgres (dev stack); every
 * row is deleted by id at the end.
 */
const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') {
      return process.env.STUB_PAYMENT_SECRET ?? 'test-stub-secret-at-least-16-chars';
    }
    if (key === 'STOREFRONT_URL') return 'http://localhost:3001';
    if (key === 'PYQ_FREE_DAILY_QUESTIONS') return 20;
    return process.env[key];
  },
} as never;
const mail = {
  sendBestEffort: () => Promise.resolve({ delivered: true as const, messageId: 'x' }),
} as never;
const whatsapp = {
  enabled: () => false,
  send: () => Promise.resolve({ delivered: true as const, messageId: 'x' }),
} as never;

const prisma = new PrismaService();
const provider = new StubPaymentAdapter(config);
const entitlements = new EntitlementService(prisma);
const orders = new OrderService(prisma, provider, entitlements);
const payments = new PaymentService(prisma, provider, entitlements, mail, whatsapp, config, new OrderEvents());
const access = new PyqAccessService(prisma, entitlements, config);
const plans = new PyqPlansService(prisma);

const PRICE = 99_900n;
const DAYS = 30;
const DAY = 86_400_000;
let planId: string;
const userIds: string[] = [];

async function newUser() {
  const user = await prisma.user.create({
    data: {
      email: `pyq-plan-spec-${randomUUID()}@jsmf.test`,
      name: 'Plan Spec',
      status: UserStatus.ACTIVE,
    },
  });
  userIds.push(user.id);
  return user.id;
}

async function buy(userId: string) {
  const checkout = await orders.checkout({ userId, productId: planId, customerEmail: 'plan@jsmf.test' });
  if (checkout.kind !== 'PAYMENT_REQUIRED') throw new Error('expected a paid checkout');
  const delivery = provider.simulateWebhook({
    providerOrderId: checkout.providerOrderId,
    amountMinor: PRICE,
  });
  await payments.handleWebhook(delivery.rawBody, delivery.headers);
  return checkout;
}

function planRow(userId: string) {
  return prisma.entitlement.findFirstOrThrow({
    where: { userId, productId: planId, status: EntitlementStatus.ACTIVE },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const product = await prisma.product.create({
    data: {
      slug: `pyq-plan-spec-${randomUUID()}`,
      title: 'Plan Spec',
      type: ProductType.COURSE,
      accessType: AccessType.PAID,
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      priceAmountMinor: PRICE,
      metadata: { pyqSubscription: true, durationDays: DAYS, features: ['Unlimited'] },
    },
  });
  planId = product.id;
});

afterAll(async () => {
  for (const id of userIds) {
    await prisma.entitlement.deleteMany({ where: { userId: id } });
    const orderIds = (
      await prisma.order.findMany({ where: { userId: id }, select: { id: true } })
    ).map((o) => o.id);
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await prisma.product.deleteMany({ where: { id: planId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('PYQ plans', () => {
  it('lists the plan publicly with duration and features', async () => {
    const plan = (await plans.list()).find((p) => p.id === planId);
    expect(plan).toMatchObject({
      durationDays: DAYS,
      priceAmountMinor: PRICE.toString(),
      features: ['Unlimited'],
    });
  });

  it('buying a plan makes access unlimited for durationDays, and logs it', async () => {
    const userId = await newUser();
    expect((await access.describe(userId)).subscribed).toBe(false);

    const spy = vi.spyOn(Logger.prototype, 'log');
    const before = Date.now();
    await buy(userId);

    const described = await access.describe(userId);
    expect(described.subscribed).toBe(true);
    expect(described.remainingToday).toBeNull();
    expect(described.plan?.productId).toBe(planId);

    const expires = (await planRow(userId)).expiresAt!.getTime();
    expect(expires).toBeGreaterThanOrEqual(before + DAYS * DAY);
    expect(expires).toBeLessThan(Date.now() + DAYS * DAY + 1000);

    const logged = spy.mock.calls.some(
      ([entry]) => (entry as { activity?: string } | undefined)?.activity === 'pyq.plan_purchased',
    );
    spy.mockRestore();
    expect(logged).toBe(true);
  });

  it('a redelivered webhook does not add days twice', async () => {
    const userId = await newUser();
    const checkout = await buy(userId);
    const first = (await planRow(userId)).expiresAt!.getTime();
    const again = provider.simulateWebhook({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
    });
    await payments.handleWebhook(again.rawBody, again.headers);
    expect((await planRow(userId)).expiresAt!.getTime()).toBe(first);
  });

  it('respects expiry, and buying after expiry starts a fresh term', async () => {
    const userId = await newUser();
    await buy(userId);
    const row = await planRow(userId);
    await prisma.entitlement.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await access.describe(userId)).subscribed).toBe(false);

    await buy(userId);
    const renewed = await planRow(userId);
    expect(renewed.expiresAt!.getTime()).toBeGreaterThan(Date.now() + (DAYS - 1) * DAY);
    expect((await access.describe(userId)).subscribed).toBe(true);
  });

  it('renewing while active extends from the current expiry', async () => {
    const userId = await newUser();
    await buy(userId);
    const first = (await planRow(userId)).expiresAt!.getTime();
    await buy(userId);
    const second = (await planRow(userId)).expiresAt!.getTime();
    expect(second).toBe(first + DAYS * DAY);
  });

  it('refunding the plan order revokes access', async () => {
    const userId = await newUser();
    const checkout = await buy(userId);
    expect((await access.describe(userId)).subscribed).toBe(true);
    await payments.refund(checkout.orderId, userId, 'spec refund');
    expect((await access.describe(userId)).subscribed).toBe(false);
  });

  it('keeps plans out of the library', async () => {
    const userId = await newUser();
    await buy(userId);
    const library = await entitlements.listForUser(userId);
    expect(library.find((e) => e.productId === planId)).toBeUndefined();
  });
});
