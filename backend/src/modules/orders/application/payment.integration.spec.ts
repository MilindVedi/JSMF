import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessType,
  EntitlementStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  ProductType,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { OrderService } from './order.service';
import { PaymentService } from './payment.service';

/**
 * The payment path against a real Postgres.
 *
 * These are the failure modes that cost money rather than the ones that throw a
 * stack trace, so they are exercised against the database with its real
 * constraints — a mocked Prisma would happily accept the duplicate insert whose
 * rejection is the entire point. The services are wired by hand rather than
 * through the Nest container: `emitDecoratorMetadata` is a TypeScript compiler
 * feature that Vitest's esbuild transform does not implement, so container
 * injection would fail here for reasons that have nothing to do with the code
 * under test.
 *
 * Requires the dev stack (`docker compose up`). Every row created is deleted by
 * its own id at the end.
 */

/** Only the keys these services actually read. */
const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') {
      return process.env.STUB_PAYMENT_SECRET ?? 'test-stub-secret-at-least-16-chars';
    }
    return process.env[key];
  },
} as never;

const prisma = new PrismaService();
const provider = new StubPaymentAdapter(config);
const entitlements = new EntitlementService(prisma);
const orders = new OrderService(prisma, provider, entitlements);
const payments = new PaymentService(prisma, provider, entitlements);

/** Everything created here, so teardown deletes exactly this and nothing else. */
const created = { userIds: [] as string[], productIds: [] as string[] };

let userId: string;
let productId: string;
const PRICE = 49900n;

beforeAll(async () => {
  await prisma.$connect();

  const user = await prisma.user.create({
    data: {
      email: `payment-spec-${randomUUID()}@jsmf.test`,
      name: 'Payment Spec',
      status: UserStatus.ACTIVE,
    },
  });
  userId = user.id;
  created.userIds.push(user.id);

  const product = await prisma.product.create({
    data: {
      slug: `payment-spec-${randomUUID()}`,
      title: 'Payment Spec Product',
      type: ProductType.PDF,
      accessType: AccessType.PAID,
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      priceAmountMinor: PRICE,
      currency: 'INR',
    },
  });
  productId = product.id;
  created.productIds.push(product.id);
});

afterAll(async () => {
  // Exact ids created above, in dependency order. Nothing is matched by
  // pattern or prefix.
  for (const id of created.userIds) {
    await prisma.entitlement.deleteMany({ where: { userId: id } });
    const userOrders = await prisma.order.findMany({
      where: { userId: id },
      select: { id: true },
    });
    const orderIds = userOrders.map((order) => order.id);
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });

  await prisma.$disconnect();
});

/** A fresh checkout, ready to be paid. */
async function startCheckout() {
  const result = await orders.checkout({
    userId,
    productId,
    customerEmail: 'payment-spec@jsmf.test',
  });

  if (result.kind !== 'PAYMENT_REQUIRED') throw new Error('expected a paid checkout');
  return result;
}

async function clearEntitlement() {
  await prisma.entitlement.deleteMany({ where: { userId, productId } });
}

/** Builds a correctly signed webhook and puts it through the real endpoint path. */
function deliver(options: Parameters<StubPaymentAdapter['simulateWebhook']>[0]) {
  const delivery = provider.simulateWebhook(options);
  return payments.handleWebhook(delivery.rawBody, delivery.headers);
}

describe('payment settlement', () => {
  it('grants an entitlement when the capture webhook arrives', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();

    const result = await deliver({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
    });

    expect(result.processed).toBe(true);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);

    const entitlement = await entitlements.findActive(userId, productId);
    expect(entitlement).not.toBeNull();
  });

  it('treats a redelivered webhook as a duplicate rather than settling twice', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    const eventId = `evt_dup_${randomUUID()}`;

    const first = await deliver({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
      eventId,
    });
    const second = await deliver({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
      eventId,
    });

    expect(first.processed).toBe(true);
    expect(second.duplicate).toBe(true);

    const active = await prisma.entitlement.count({
      where: { userId, productId, status: EntitlementStatus.ACTIVE },
    });
    expect(active).toBe(1);
  });

  it('rejects a webhook whose amount does not match the recorded order', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();

    await expect(
      deliver({
        providerOrderId: checkout.providerOrderId,
        amountMinor: 1n,
      }),
    ).rejects.toThrow(/Amount mismatch/);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).not.toBe(OrderStatus.PAID);
  });

  /**
   * Gap 3. Checkout writes the order, calls the provider, then writes the
   * payments row that links the two. Deleting that row reproduces a crash in
   * the last gap: the buyer can still pay, and the webhook arrives naming a
   * provider order nothing local knows about.
   */
  it('rebuilds a missing payments row from the provider and still settles', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();

    await prisma.payment.deleteMany({ where: { orderId: checkout.orderId } });
    expect(await prisma.payment.count({ where: { orderId: checkout.orderId } })).toBe(0);

    const result = await deliver({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
    });

    expect(result.processed).toBe(true);

    const rebuilt = await prisma.payment.findFirstOrThrow({
      where: { orderId: checkout.orderId },
    });
    expect(rebuilt.status).toBe(PaymentStatus.CAPTURED);
    expect(rebuilt.amountMinor).toBe(PRICE);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
  });

  /**
   * Gap 4. Both settle paths racing used to leave the loser's transaction
   * aborted by the entitlement unique violation, so a genuine settlement threw.
   */
  it('survives the webhook and the browser callback settling at the same moment', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    const providerPaymentId = `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

    const delivery = provider.simulateWebhook({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
      providerPaymentId,
    });

    const results = await Promise.allSettled([
      payments.handleWebhook(delivery.rawBody, delivery.headers),
      payments.verifyCheckout({
        userId,
        providerOrderId: checkout.providerOrderId,
        providerPaymentId,
        signature: provider.signCheckout(checkout.providerOrderId, providerPaymentId),
      }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(
      rejected.map((r) => String((r as PromiseRejectedResult).reason)),
    ).toEqual([]);

    const active = await prisma.entitlement.count({
      where: { userId, productId, status: EntitlementStatus.ACTIVE },
    });
    expect(active).toBe(1);
  });
});

/**
 * Gap 2. The case nothing used to notice: money taken, no webhook delivered,
 * tab closed. The provider knows; nothing asks it.
 */
describe('reconciliation', () => {
  it('settles a capture that no webhook ever reported', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();

    // The provider records a capture. Crucially, the webhook is built but never
    // delivered — this is the delivery that got lost.
    provider.simulateWebhook({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
    });

    // Old enough for the sweep to consider it worth asking about.
    await prisma.payment.updateMany({
      where: { orderId: checkout.orderId },
      data: { createdAt: new Date(Date.now() - 30 * 60_000) },
    });

    const before = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(before.status).toBe(OrderStatus.AWAITING_PAYMENT);
    expect(await entitlements.findActive(userId, productId)).toBeNull();

    const summary = await payments.reconcile({
      staleAfterMinutes: 10,
      giveUpAfterHours: 72,
      batchSize: 50,
    });

    expect(summary.settled).toBeGreaterThanOrEqual(1);
    expect(summary.errors).toBe(0);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(after.status).toBe(OrderStatus.PAID);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
  });

  it('leaves an abandoned checkout alone', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();

    // No capture recorded at the provider: the buyer simply never paid.
    await prisma.payment.updateMany({
      where: { orderId: checkout.orderId },
      data: { createdAt: new Date(Date.now() - 30 * 60_000) },
    });

    await payments.reconcile({ staleAfterMinutes: 10, giveUpAfterHours: 72, batchSize: 50 });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.AWAITING_PAYMENT);
    expect(await entitlements.findActive(userId, productId)).toBeNull();
  });

  it('ignores a checkout too old to be worth asking about', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();

    provider.simulateWebhook({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
    });

    await prisma.payment.updateMany({
      where: { orderId: checkout.orderId },
      data: { createdAt: new Date(Date.now() - 200 * 3_600_000) },
    });

    await payments.reconcile({ staleAfterMinutes: 10, giveUpAfterHours: 72, batchSize: 50 });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.AWAITING_PAYMENT);
  });
});
