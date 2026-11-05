import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementSource, EntitlementStatus, ProductStatus, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { addMonths, extendedExpiry, readPyqPlan } from '../../../shared/pyq-plan';
import { ProductService } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OrderEvents } from '../../orders/application/order-events';
import { OrderService } from '../../orders/application/order.service';
import { PaymentService } from '../../orders/application/payment.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { AdminPyqSubscriptionController } from '../http/admin-pyq-subscription.controller';
import { PyqAccessService } from './pyq-access.service';
import { PyqPlanAdminService } from './pyq-plan-admin.service';
import { PyqPlansService } from './pyq-plans.service';
import { PyqSubscriptionService } from './pyq-subscription.service';

/**
 * Subscription & pricing management end to end against the dev Postgres:
 * the env gate, plan versioning, the generic product endpoints refusing
 * plans, the one-per-account trial, and how a purchase stacks on a trial or
 * another plan. Every row is deleted by id at the end, and the shared
 * settings row is put back as it was.
 */
let managementEnabled = false;
const config = {
  get(key: string) {
    if (key === 'SUBSCRIPTION_MANAGEMENT_ENABLED') return managementEnabled;
    if (key === 'STUB_PAYMENT_SECRET') return process.env.STUB_PAYMENT_SECRET ?? 'test-stub-secret-at-least-16-chars';
    if (key === 'STOREFRONT_URL') return 'http://localhost:3001';
    if (key === 'PYQ_FREE_DAILY_QUESTIONS') return 20;
    return process.env[key];
  },
} as never;
const passThroughCache = {
  wrap: (_key: string, _ttl: number, load: () => unknown) => load(),
  del: async () => {},
} as never;
const mail = { sendBestEffort: () => Promise.resolve({ delivered: true as const, messageId: 'x' }) } as never;
const whatsapp = { enabled: () => false, send: () => Promise.resolve({ delivered: true as const, messageId: 'x' }) } as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const subscriptions = new PyqSubscriptionService(prisma, audit, passThroughCache, config);
const plans = new PyqPlansService(prisma, passThroughCache, subscriptions);
const planAdmin = new PyqPlanAdminService(prisma, audit, config, plans);
const access = new PyqAccessService(prisma, config, subscriptions);
const products = new ProductService(prisma, audit);
const provider = new StubPaymentAdapter(config);
const entitlements = new EntitlementService(prisma);
const orders = new OrderService(prisma, provider, entitlements);
const payments = new PaymentService(prisma, provider, entitlements, mail, whatsapp, config, new OrderEvents());

const DAY = 86_400_000;
/** A length no real plan uses, so the "one plan per length" rule never meets a real one. */
const MONTHS = 29;
const userIds: string[] = [];
const productIds = new Set<string>();
let admin: { id: string; ip: null };
let savedSettings: { trialEnabled: boolean; trialDays: number; features: string[] };

async function newUser() {
  const user = await prisma.user.create({
    data: { email: `pyq-sub-spec-${randomUUID()}@jsmf.test`, name: 'Sub Spec', status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);
  return user.id;
}

/** Runs `fn` with management switched on, and always switches it back off. */
async function managing<T>(fn: () => Promise<T>): Promise<T> {
  managementEnabled = true;
  try {
    return await fn();
  } finally {
    managementEnabled = false;
  }
}

async function createPlan(input: Partial<Parameters<typeof planAdmin.create>[0]> = {}) {
  const plan = await managing(() =>
    planAdmin.create({ durationMonths: MONTHS, priceAmountMinor: '149900', ...input }, admin),
  );
  productIds.add(plan.id);
  return plan;
}

async function takeOffSale(id: string) {
  await managing(() => planAdmin.setOnSale(id, false, admin));
}

async function buy(userId: string, productId: string) {
  const checkout = await orders.checkout({ userId, productId, customerEmail: 'sub@jsmf.test' });
  if (checkout.kind !== 'PAYMENT_REQUIRED') throw new Error('expected a paid checkout');
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const delivery = provider.simulateWebhook({
    providerOrderId: checkout.providerOrderId,
    amountMinor: product.priceAmountMinor,
  });
  await payments.handleWebhook(delivery.rawBody, delivery.headers);
  return checkout;
}

function planExpiry(userId: string, productId: string) {
  return prisma.entitlement
    .findFirstOrThrow({ where: { userId, productId, status: EntitlementStatus.ACTIVE } })
    .then((row) => row.expiresAt!);
}

beforeAll(async () => {
  await prisma.$connect();
  admin = { id: await newUser(), ip: null };
  savedSettings = await subscriptions.settings();
});

afterAll(async () => {
  await prisma.pyqSubscriptionSettings.update({ where: { id: 'global' }, data: savedSettings });
  for (const id of userIds) {
    await prisma.entitlement.deleteMany({ where: { userId: id } });
    const orderIds = (await prisma.order.findMany({ where: { userId: id }, select: { id: true } })).map((o) => o.id);
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await prisma.entitlement.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  // Trials go with their user (ON DELETE CASCADE).
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('plan terms', () => {
  it('adds calendar months, landing on the last day of a shorter month', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
    expect(addMonths(new Date('2026-03-31T00:00:00Z'), 12).toISOString()).toBe('2027-03-31T00:00:00.000Z');
  });

  it('starts a new term at the latest of now, the current expiry and the trial end', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const terms = { durationMonths: 1, durationDays: null };
    expect(extendedExpiry(null, terms, now).toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(extendedExpiry(new Date('2026-05-10T00:00:00Z'), terms, now).toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(extendedExpiry(null, terms, now, new Date('2026-05-08T00:00:00Z')).toISOString()).toBe(
      '2026-06-08T00:00:00.000Z',
    );
  });

  it('still reads older day-based plans, and rejects nonsense lengths', () => {
    expect(readPyqPlan({ pyqSubscription: true, durationDays: 30 })).toMatchObject({ durationDays: 30, durationMonths: null });
    expect(readPyqPlan({ pyqSubscription: true, durationMonths: 0 })).toBeNull();
    expect(readPyqPlan({ pyqSubscription: true, durationMonths: 1.5 })).toBeNull();
    expect(readPyqPlan({ pyqSubscription: true, durationMonths: 999 })).toBeNull();
    expect(readPyqPlan({ durationMonths: 3 })).toBeNull();
  });
});

describe('the SUBSCRIPTION_MANAGEMENT_ENABLED gate', () => {
  it('refuses every write while off, and changes nothing', async () => {
    const plan = await createPlan({ onSale: false });
    const before = await prisma.product.findUniqueOrThrow({ where: { id: plan.id } });

    const refusals = [
      planAdmin.create({ durationMonths: MONTHS, priceAmountMinor: '100' }, admin),
      planAdmin.update(plan.id, { priceAmountMinor: '100' }, admin),
      planAdmin.update(plan.id, { title: 'Renamed' }, admin),
      planAdmin.setOnSale(plan.id, true, admin),
      subscriptions.updateSettings({ trialEnabled: true }, admin),
    ];
    for (const attempt of refusals) {
      await expect(attempt).rejects.toMatchObject({
        response: { code: 'SUBSCRIPTION_MANAGEMENT_DISABLED' },
      });
    }

    expect(await prisma.product.findUniqueOrThrow({ where: { id: plan.id } })).toEqual(before);
    expect(await subscriptions.settings()).toEqual(savedSettings);
  });

  it('still lets the page read everything while off', async () => {
    await expect(planAdmin.list()).resolves.toBeInstanceOf(Array);
    await expect(subscriptions.settings()).resolves.toHaveProperty('features');
  });
});

describe('plans', () => {
  it('creates a plan on sale that lists publicly with the shared benefits', async () => {
    const plan = await createPlan({ subtitle: '  Spec   plan ' });
    expect(plan).toMatchObject({ title: '29 months', subtitle: 'Spec plan', durationMonths: MONTHS, onSale: true });

    const listed = (await plans.list()).find((p) => p.id === plan.id);
    expect(listed).toMatchObject({
      durationMonths: MONTHS,
      priceAmountMinor: '149900',
      features: (await subscriptions.settings()).features,
    });
    await takeOffSale(plan.id);
    expect((await plans.list()).some((p) => p.id === plan.id)).toBe(false);
  });

  it('refuses a second plan of the same length on sale', async () => {
    const plan = await createPlan();
    await expect(createPlan({ priceAmountMinor: '199900' })).rejects.toThrow(/already on sale for 29 months/);
    await takeOffSale(plan.id);
  });

  it('refuses a "was" price that is not above the price', async () => {
    await expect(createPlan({ priceAmountMinor: '149900', compareAtAmountMinor: '149900' })).rejects.toThrow(
      /"was" price must be higher/,
    );
  });

  it('edits display fields in place, keeping the id', async () => {
    const plan = await createPlan({ onSale: false });
    const edited = await managing(() =>
      planAdmin.update(plan.id, { title: 'Long haul', popular: true, compareAtAmountMinor: '199900' }, admin),
    );
    expect(edited).toMatchObject({ id: plan.id, title: 'Long haul', popular: true, compareAtAmountMinor: '199900' });
  });

  it('replaces the plan when the price changes; holders of the old one keep access', async () => {
    const plan = await createPlan();
    const holder = await newUser();
    await buy(holder, plan.id);
    const held = await planExpiry(holder, plan.id);

    const replacement = await managing(() => planAdmin.update(plan.id, { priceAmountMinor: '129900' }, admin));
    productIds.add(replacement.id);

    expect(replacement.id).not.toBe(plan.id);
    expect(replacement).toMatchObject({ priceAmountMinor: '129900', durationMonths: MONTHS, onSale: true });

    const old = await prisma.product.findUniqueOrThrow({ where: { id: plan.id } });
    expect(old.status).toBe(ProductStatus.UNPUBLISHED);
    expect(old.priceAmountMinor).toBe(149_900n); // the old terms are never rewritten
    expect(readPyqPlan(old.metadata)?.supersededBy).toBe(replacement.id);

    // The holder's access is untouched; the old version is gone from sale and from the admin list.
    expect(await access.describe(holder)).toMatchObject({ subscribed: true, plan: { productId: plan.id } });
    expect(await planExpiry(holder, plan.id)).toEqual(held);
    expect((await planAdmin.list()).map((p) => p.id)).not.toContain(plan.id);
    await expect(orders.checkout({ userId: await newUser(), productId: plan.id, customerEmail: 'late@jsmf.test' })).rejects.toThrow();

    // The old version cannot be edited any more — only its replacement.
    await expect(managing(() => planAdmin.update(plan.id, { title: 'x' }, admin))).rejects.toBeInstanceOf(
      ConflictException,
    );

    // Buying the new version while holding the old one stacks on top of the old expiry.
    await buy(holder, replacement.id);
    expect((await planExpiry(holder, replacement.id)).toISOString()).toBe(addMonths(held, MONTHS).toISOString());

    await takeOffSale(replacement.id);
  });

  it('serialises concurrent replacements so only one version results', async () => {
    const plan = await createPlan({ onSale: false });
    const results = await managing(() =>
      Promise.allSettled([
        planAdmin.update(plan.id, { priceAmountMinor: '111100' }, admin),
        planAdmin.update(plan.id, { priceAmountMinor: '222200' }, admin),
      ]),
    );
    for (const r of results) if (r.status === 'fulfilled') productIds.add(r.value.id);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('the generic product endpoints', () => {
  it('refuse to edit, publish, unpublish or archive a plan', async () => {
    const plan = await createPlan({ onSale: false });
    const actor = { id: admin.id, ip: null };
    await expect(products.update(plan.id, { priceAmountMinor: '100' }, actor)).rejects.toBeInstanceOf(ConflictException);
    await expect(products.publish(plan.id, actor)).rejects.toBeInstanceOf(ConflictException);
    await expect(products.unpublish(plan.id, actor)).rejects.toBeInstanceOf(ConflictException);
    await expect(products.archive(plan.id, actor)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: plan.id } })).deletedAt).toBeNull();
  });

  it('leave plans out of the admin product list', async () => {
    const plan = await createPlan({ onSale: false, title: `Hidden ${randomUUID()}` });
    const page = await products.findForAdmin({ q: plan.title } as never);
    expect(page.items).toHaveLength(0);
  });
});

describe('free trial', () => {
  it('is refused while trials are off', async () => {
    await managing(() => subscriptions.updateSettings({ trialEnabled: false }, admin));
    const user = await newUser();
    expect((await access.describe(user)).trialOffer).toBeNull();
    await expect(subscriptions.startTrial(user)).rejects.toMatchObject({ response: { code: 'PYQ_TRIAL_UNAVAILABLE' } });
  });

  it('gives full access for the configured days, once per account', async () => {
    await managing(() => subscriptions.updateSettings({ trialEnabled: true, trialDays: 5 }, admin));
    const user = await newUser();
    expect((await access.describe(user)).trialOffer).toEqual({ days: 5 });

    const started = Date.now();
    const trial = await subscriptions.startTrial(user);
    expect(new Date(trial.endsAt).getTime()).toBeGreaterThanOrEqual(started + 5 * DAY - 1000);

    const now = await access.describe(user);
    expect(now).toMatchObject({ subscribed: true, dailyLimit: null, plan: null, trialOffer: null });
    expect(now.trial?.days).toBe(5);
    await expect(access.assertCanAnswer(user)).resolves.toBeUndefined();

    await expect(subscriptions.startTrial(user)).rejects.toMatchObject({ response: { code: 'PYQ_TRIAL_NOT_ELIGIBLE' } });

    // A later change of length applies to new trials only.
    await managing(() => subscriptions.updateSettings({ trialDays: 30 }, admin));
    expect((await access.describe(user)).trial?.days).toBe(5);
  });

  it('cannot be started twice by requests racing each other', async () => {
    await managing(() => subscriptions.updateSettings({ trialEnabled: true }, admin));
    const user = await newUser();
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => subscriptions.startTrial(user)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.pyqTrial.count({ where: { userId: user } })).toBe(1);
  });

  it('is not offered to anyone who has ever held a plan', async () => {
    await managing(() => subscriptions.updateSettings({ trialEnabled: true }, admin));
    const plan = await createPlan({ onSale: false });
    const user = await newUser();
    // Even an expired one.
    await prisma.entitlement.create({
      data: {
        userId: user,
        productId: plan.id,
        source: EntitlementSource.ADMIN_GRANT,
        status: EntitlementStatus.ACTIVE,
        expiresAt: new Date(Date.now() - DAY),
      },
    });
    expect((await access.describe(user)).trialOffer).toBeNull();
    await expect(subscriptions.startTrial(user)).rejects.toMatchObject({ response: { code: 'PYQ_TRIAL_NOT_ELIGIBLE' } });
  });

  it('keeps running when trials are turned off', async () => {
    await managing(() => subscriptions.updateSettings({ trialEnabled: true, trialDays: 7 }, admin));
    const user = await newUser();
    await subscriptions.startTrial(user);
    await managing(() => subscriptions.updateSettings({ trialEnabled: false }, admin));
    expect(await access.describe(user)).toMatchObject({ subscribed: true });
  });

  it('a plan bought during the trial starts when the trial ends', async () => {
    await managing(() => subscriptions.updateSettings({ trialEnabled: true, trialDays: 7 }, admin));
    const plan = await createPlan();
    const user = await newUser();
    const trial = await subscriptions.startTrial(user);

    await buy(user, plan.id);
    const expiry = await planExpiry(user, plan.id);
    expect(expiry.toISOString()).toBe(addMonths(new Date(trial.endsAt), MONTHS).toISOString());
    expect(await access.describe(user)).toMatchObject({ subscribed: true, plan: { productId: plan.id } });

    await takeOffSale(plan.id);
  });

  it('normalises the benefits list', async () => {
    const settings = await managing(() =>
      subscriptions.updateSettings({ features: ['  One   thing ', '', 'one thing', 'Two'] }, admin),
    );
    expect(settings.features).toEqual(['One thing', 'Two']);
  });
});

describe('roles', () => {
  it('lets only admins reach any subscription management endpoint', () => {
    const guard = new RolesGuard(new Reflector());
    const contextFor = (handler: string, roles: string[]) =>
      ({
        getClass: () => AdminPyqSubscriptionController,
        getHandler: () => (AdminPyqSubscriptionController.prototype as unknown as Record<string, unknown>)[handler],
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', roles } }) }),
      }) as unknown as ExecutionContext;

    for (const handler of ['overview', 'updateSettings', 'createPlan', 'updatePlan', 'setOnSale']) {
      expect(guard.canActivate(contextFor(handler, ['ADMIN']))).toBe(true);
      expect(() => guard.canActivate(contextFor(handler, ['EDUCATOR']))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(contextFor(handler, ['USER']))).toThrow(ForbiddenException);
    }
  });
});
