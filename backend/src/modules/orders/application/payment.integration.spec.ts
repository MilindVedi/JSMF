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
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { BundleContentsService } from '../../catalog/application/bundle-contents.service';
import { ProductService } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { OrderEvents } from './order-events';
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
    if (key === 'STOREFRONT_URL') {
      return process.env.STOREFRONT_URL ?? 'http://localhost:3001';
    }
    return process.env[key];
  },
} as never;

/**
 * Records sends instead of making them. The confirmation email is best-effort,
 * so a real adapter failing here would be silently swallowed and the assertions
 * about *how many* were sent would still pass — which is exactly the bug the
 * once-only test is looking for.
 */
const sentMail: Array<{ to: unknown; subject: string; text: string; tag?: string }> = [];
/** Flipped per-test to simulate an exhausted quota or a refused send. */
let mailOutcome: 'delivered' | 'quota' | 'error' = 'delivered';

const mail = {
  sendBestEffort(request: { to: unknown; subject: string; text: string; tag?: string }) {
    sentMail.push(request);

    if (mailOutcome === 'delivered') {
      return Promise.resolve({ delivered: true as const, messageId: 'test-message-id' });
    }

    // Mirrors the real MailService contract exactly: `sendBestEffort` reports
    // failure, it never throws. A stub that threw would test a code path that
    // cannot happen and hide the one that can.
    return Promise.resolve({ delivered: false as const, reason: mailOutcome });
  },
} as never;

/**
 * The WhatsApp side of the same contract. Records instead of sending, and can
 * be made to fail, because a receipt that cannot be delivered must not undo a
 * purchase whichever channel it was going by.
 */
const sentWhatsApp: Array<{ to: string; message: { kind: string; [key: string]: unknown }; tag?: string }> = [];
let whatsAppOutcome: 'delivered' | 'quota' | 'error' = 'delivered';
let whatsAppEnabled = true;

const whatsapp = {
  enabled: () => whatsAppEnabled,
  send(request: { to: string; message: { kind: string }; tag?: string }) {
    sentWhatsApp.push(request as (typeof sentWhatsApp)[number]);
    return Promise.resolve(
      whatsAppOutcome === 'delivered'
        ? { delivered: true as const, messageId: 'test-wamid' }
        : { delivered: false as const, reason: whatsAppOutcome },
    );
  },
} as never;

const prisma = new PrismaService();
const provider = new StubPaymentAdapter(config);
const entitlements = new EntitlementService(prisma);
const orders = new OrderService(prisma, provider, entitlements);
const payments = new PaymentService(prisma, provider, entitlements, mail, whatsapp, config, new OrderEvents());
const audit = new AuditService(prisma);
const catalog = new ProductService(prisma, audit);
const bundles = new BundleContentsService(prisma, entitlements, audit);

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
  // A PDF inside a bundle cannot be deleted while the bundle lists it.
  await prisma.productBundleItem.deleteMany({ where: { bundleProductId: { in: created.productIds } } });
  await prisma.productAsset.deleteMany({ where: { productId: { in: created.productIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: created.userIds } } });
  await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });

  await prisma.$disconnect();
});

/** A fresh checkout, ready to be paid. */
async function startCheckout(buyer = { userId, customerEmail: 'payment-spec@jsmf.test' as string | null }) {
  const result = await orders.checkout({
    userId: buyer.userId,
    productId,
    customerEmail: buyer.customerEmail,
  });

  if (result.kind !== 'PAYMENT_REQUIRED') throw new Error('expected a paid checkout');
  return result;
}

/**
 * A buyer who signed up with a mobile number: no email anywhere, a verified
 * number on the account. Created per test so the teardown list stays exact.
 */
async function createMobileBuyer(overrides: { phoneVerifiedAt?: Date | null } = {}) {
  const user = await prisma.user.create({
    data: {
      email: null,
      phone: `9199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
      phoneVerifiedAt: overrides.phoneVerifiedAt === undefined ? new Date() : overrides.phoneVerifiedAt,
      name: 'Mobile Buyer',
      status: UserStatus.ACTIVE,
    },
  });
  created.userIds.push(user.id);
  return user;
}

/** Pays an order the ordinary way: one webhook. */
async function pay(checkout: Awaited<ReturnType<typeof startCheckout>>) {
  const providerPaymentId = `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await deliver({
    providerOrderId: checkout.providerOrderId,
    amountMinor: PRICE,
    providerPaymentId,
  });
  return providerPaymentId;
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

  /**
   * The failure this guards against is not a crash — it is a buyer receiving
   * three identical "your purchase is confirmed" emails, because the browser
   * callback, the provider's webhook retry and the reconciliation sweep all
   * settle the same order. Only the call that actually moves the order into
   * PAID may send.
   */
  it('sends exactly one confirmation email however many times settlement is attempted', async () => {
    await clearEntitlement();
    sentMail.length = 0;

    const checkout = await startCheckout();
    const providerPaymentId = `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const delivery = provider.simulateWebhook({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
      providerPaymentId,
    });

    // The webhook, then the browser callback, then a redelivery of the same
    // webhook — the ordinary sequence for a single purchase.
    await payments.handleWebhook(delivery.rawBody, delivery.headers);
    await payments.verifyCheckout({
      userId,
      providerOrderId: checkout.providerOrderId,
      providerPaymentId,
      signature: provider.signCheckout(checkout.providerOrderId, providerPaymentId),
    });
    await payments.handleWebhook(delivery.rawBody, delivery.headers);

    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].tag).toBe('purchase-confirmation');
    // The identifiers a support conversation needs are actually in the body.
    expect(sentMail[0].text).toContain(checkout.orderNumber);
    expect(sentMail[0].text).toContain(providerPaymentId);
  });

  /**
   * The standing rule, asserted rather than assumed: **an email must never be
   * the reason a completed action is reported as failed.**
   *
   * The buyer has paid by this point. If an exhausted mail quota could undo
   * that, a full inbox would take money and withhold the thing it was for —
   * and the webhook would keep retrying an operation that already worked.
   * Both failure shapes are checked because they arrive by different paths:
   * a quota is a refusal the provider reports, an error can be anything.
   */
  for (const outcome of ['quota', 'error'] as const) {
    it(`completes the purchase when the confirmation email fails (${outcome})`, async () => {
      await clearEntitlement();
      sentMail.length = 0;
      mailOutcome = outcome;

      try {
        const checkout = await startCheckout();
        const providerPaymentId = `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
        const delivery = provider.simulateWebhook({
          providerOrderId: checkout.providerOrderId,
          amountMinor: PRICE,
          providerPaymentId,
        });

        // Must not throw: the settlement is what grants access, and it has to
        // survive the email that describes it failing.
        await payments.handleWebhook(delivery.rawBody, delivery.headers);

        // The send was attempted and refused...
        expect(sentMail).toHaveLength(1);

        // ...and everything that actually matters still happened.
        const active = await prisma.entitlement.count({
          where: { userId, productId, status: EntitlementStatus.ACTIVE },
        });
        expect(active).toBe(1);

        const order = await prisma.order.findUnique({
          where: { orderNumber: checkout.orderNumber },
        });
        expect(order?.status).toBe(OrderStatus.PAID);
        expect(order?.paidAt).not.toBeNull();
      } finally {
        mailOutcome = 'delivered';
      }
    });
  }
});

/**
 * Where the receipt goes, for a buyer who has no email.
 *
 * The rule being protected is that **exactly one receipt goes out, by whichever
 * channel the buyer can actually receive** — and that, as everywhere else in
 * this file, failing to deliver it never costs the buyer the purchase.
 */
describe('purchase receipts', () => {
  function reset() {
    sentMail.length = 0;
    sentWhatsApp.length = 0;
    whatsAppOutcome = 'delivered';
    whatsAppEnabled = true;
  }

  it('sends the receipt on WhatsApp when the buyer has no email', async () => {
    reset();
    const buyer = await createMobileBuyer();
    const checkout = await startCheckout({ userId: buyer.id, customerEmail: null });

    await pay(checkout);

    expect(sentMail).toHaveLength(0);
    expect(sentWhatsApp).toHaveLength(1);
    expect(sentWhatsApp[0]).toMatchObject({
      to: buyer.phone,
      tag: 'purchase-confirmation',
      message: {
        kind: 'purchase-receipt',
        // The first name, not the row's full name.
        buyerName: 'Mobile',
        items: 'Payment Spec Product',
        totalFormatted: '₹499',
        orderNumber: checkout.orderNumber,
        // The same destination the email links to, and deliberately not a
        // direct download: a signed download URL would still work for whoever
        // the message was forwarded to.
        // The storefront, not the API. `APP_PUBLIC_URL` ends in `/api` and
        // produced links to a page that has never existed.
        libraryUrl: `${process.env.STOREFRONT_URL ?? 'http://localhost:3001'}/library`,
      },
    });
  });

  it('sends only the email when the buyer has one, never both', async () => {
    // Two receipts for one purchase is an annoyance that also costs money per
    // WhatsApp message.
    reset();
    await clearEntitlement();
    const checkout = await startCheckout();

    await pay(checkout);

    expect(sentMail).toHaveLength(1);
    expect(sentWhatsApp).toHaveLength(0);
  });

  it('sends nothing to an unverified number', async () => {
    // `orders.customer_phone` can hold a number typed at checkout. A receipt
    // naming what someone bought must not go to a number a typo could make a
    // stranger's.
    reset();
    const buyer = await createMobileBuyer({ phoneVerifiedAt: null });
    const checkout = await startCheckout({ userId: buyer.id, customerEmail: null });

    await pay(checkout);

    expect(sentWhatsApp).toHaveLength(0);
    expect(sentMail).toHaveLength(0);
  });

  it('sends nothing when WhatsApp is not configured', async () => {
    reset();
    whatsAppEnabled = false;
    const buyer = await createMobileBuyer();
    const checkout = await startCheckout({ userId: buyer.id, customerEmail: null });

    await pay(checkout);

    expect(sentWhatsApp).toHaveLength(0);
  });

  for (const outcome of ['quota', 'error'] as const) {
    it(`completes the purchase when the WhatsApp receipt fails (${outcome})`, async () => {
      reset();
      whatsAppOutcome = outcome;

      const buyer = await createMobileBuyer();
      const checkout = await startCheckout({ userId: buyer.id, customerEmail: null });

      // Must not throw, for the same reason the email test gives: the buyer
      // has paid, and the webhook would otherwise retry forever.
      await pay(checkout);

      expect(sentWhatsApp).toHaveLength(1);

      const active = await prisma.entitlement.count({
        where: { userId: buyer.id, productId, status: EntitlementStatus.ACTIVE },
      });
      expect(active).toBe(1);

      const order = await prisma.order.findUnique({ where: { orderNumber: checkout.orderNumber } });
      expect(order?.status).toBe(OrderStatus.PAID);
    });
  }

  it('sends exactly one WhatsApp receipt however many times settlement is attempted', async () => {
    reset();
    const buyer = await createMobileBuyer();
    const checkout = await startCheckout({ userId: buyer.id, customerEmail: null });
    const providerPaymentId = `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const delivery = provider.simulateWebhook({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
      providerPaymentId,
    });

    await payments.handleWebhook(delivery.rawBody, delivery.headers);
    await payments.verifyCheckout({
      userId: buyer.id,
      providerOrderId: checkout.providerOrderId,
      providerPaymentId,
      signature: provider.signCheckout(checkout.providerOrderId, providerPaymentId),
    });
    await payments.handleWebhook(delivery.rawBody, delivery.headers);

    expect(sentWhatsApp).toHaveLength(1);
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

/**
 * Go-live hardening. Each test here is a way a real buyer could pay and not
 * get their seat (or get it taken back wrongly) that the suites above did not
 * cover.
 */
describe('go-live hardening', () => {
  it('retries a webhook that failed on its first delivery instead of treating the redelivery as a duplicate', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    const eventId = `evt_retry_${randomUUID()}`;
    const providerPaymentId = `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

    // A transient failure during the first settlement — a database blip, a
    // redeploy mid-request. Razorpay will redeliver the same event id.
    const target = payments as unknown as { settle: (...args: unknown[]) => Promise<void> };
    const original = target.settle;
    target.settle = () => Promise.reject(new Error('transient failure'));
    try {
      await expect(
        deliver({ providerOrderId: checkout.providerOrderId, amountMinor: PRICE, eventId, providerPaymentId }),
      ).rejects.toThrow('transient failure');
    } finally {
      target.settle = original;
    }

    const failed = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { providerEventId: eventId } });
    expect(failed.status).toBe('FAILED');

    const redelivered = await deliver({
      providerOrderId: checkout.providerOrderId,
      amountMinor: PRICE,
      eventId,
      providerPaymentId,
    });

    expect(redelivered.processed).toBe(true);
    expect(redelivered.duplicate).toBe(false);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();

    const processed = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { providerEventId: eventId } });
    expect(processed.status).toBe('PROCESSED');
    expect(processed.processingError).toBeNull();
  });

  it('acknowledges a capture on a Razorpay order JSMF did not create (Payment Page) instead of failing the webhook', async () => {
    const foreignOrderId = `order_foreign_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    // A Payment Page order on the same account: no jsmf_order_id in its notes.
    (provider as unknown as { orders: Map<string, unknown> }).orders.set(foreignOrderId, {
      receipt: 'payment-page',
      notes: {},
      amountMinor: 79900n,
      currency: 'INR',
    });
    const eventId = `evt_foreign_${randomUUID()}`;

    const result = await deliver({ providerOrderId: foreignOrderId, amountMinor: 79900n, eventId });

    expect(result.processed).toBe(true);
    const event = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { providerEventId: eventId } });
    expect(event.status).toBe('PROCESSED');
    expect(await prisma.payment.count({ where: { providerOrderId: foreignOrderId } })).toBe(0);
  });

  it('sends exactly one confirmation when the webhook and the browser callback race', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await clearEntitlement();
      sentMail.length = 0;
      mailOutcome = 'delivered';

      const checkout = await startCheckout();
      const providerPaymentId = `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const delivery = provider.simulateWebhook({
        providerOrderId: checkout.providerOrderId,
        amountMinor: PRICE,
        providerPaymentId,
      });

      await Promise.all([
        payments.handleWebhook(delivery.rawBody, delivery.headers),
        payments.verifyCheckout({
          userId,
          providerOrderId: checkout.providerOrderId,
          providerPaymentId,
          signature: provider.signCheckout(checkout.providerOrderId, providerPaymentId),
        }),
      ]);

      expect(sentMail.filter((mail) => mail.tag === 'purchase-confirmation')).toHaveLength(1);
    }
  });

  it('does not restore access when a capture event is replayed after a refund', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    const providerPaymentId = await pay(checkout);

    await payments.refund(checkout.orderId, userId, 'spec refund');
    expect(await entitlements.findActive(userId, productId)).toBeNull();

    // The same capture, redelivered under a new event id (or picked up by
    // the reconciliation sweep) after the refund went through.
    await deliver({ providerOrderId: checkout.providerOrderId, amountMinor: PRICE, providerPaymentId });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.REFUNDED);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: checkout.orderId } });
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(await entitlements.findActive(userId, productId)).toBeNull();
  });

  it('refuses to refund a seat paid outside Razorpay (direct UPI, backfilled) and leaves access alone', async () => {
    await clearEntitlement();
    // The shape backfill-session-buyers writes for a direct UPI payment: PAID,
    // CAPTURED, but no Razorpay order or payment id behind it.
    const order = await prisma.order.create({
      data: {
        orderNumber: `SPEC-UPI-${randomUUID().slice(0, 8)}`,
        userId,
        status: OrderStatus.PAID,
        subtotalAmountMinor: PRICE,
        discountAmountMinor: 0n,
        taxAmountMinor: 0n,
        totalAmountMinor: PRICE,
        currency: 'INR',
        customerEmail: 'payment-spec@jsmf.test',
        paidAt: new Date(),
        items: {
          create: {
            productId,
            productTitleSnapshot: 'Payment Spec Product',
            productTypeSnapshot: ProductType.PDF,
            unitPriceAmountMinor: PRICE,
            quantity: 1,
            totalAmountMinor: PRICE,
          },
        },
        payments: {
          create: {
            provider: 'RAZORPAY',
            status: PaymentStatus.CAPTURED,
            method: 'upi',
            amountMinor: PRICE,
            currency: 'INR',
            capturedAt: new Date(),
          },
        },
      },
    });
    await entitlements.grant({ userId, productId, source: 'PURCHASE', sourceOrderId: order.id });

    await expect(payments.refund(order.id, userId, 'spec refund')).rejects.toThrow(/not taken through Razorpay/);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PAID);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
  });

  it('settles a retry that succeeded after a failed first attempt on the same order', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();

    await deliver({ providerOrderId: checkout.providerOrderId, amountMinor: PRICE, eventType: 'payment.failed' });
    const afterFailure = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(afterFailure.status).toBe(OrderStatus.FAILED);

    await deliver({ providerOrderId: checkout.providerOrderId, amountMinor: PRICE });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
  });

  it('a late payment.failed event does not undo a capture that already settled', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    await pay(checkout);

    await deliver({ providerOrderId: checkout.providerOrderId, amountMinor: PRICE, eventType: 'payment.failed' });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
  });

  it('reconciliation finds a capture on an order whose first attempt failed and whose capture webhook was lost', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();

    await deliver({ providerOrderId: checkout.providerOrderId, amountMinor: PRICE, eventType: 'payment.failed' });

    // The retry is captured at the provider, but that webhook never arrives
    // and the buyer closed the tab.
    provider.simulateWebhook({ providerOrderId: checkout.providerOrderId, amountMinor: PRICE });

    await prisma.payment.updateMany({
      where: { orderId: checkout.orderId },
      data: { createdAt: new Date(Date.now() - 30 * 60_000) },
    });

    const summary = await payments.reconcile({ staleAfterMinutes: 10, giveUpAfterHours: 72, batchSize: 50 });
    expect(summary.errors).toBe(0);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
  });
});

describe('admin refunds: partial, manual, and keeping access', () => {
  /** A seat paid by direct UPI and recorded by hand: PAID, CAPTURED, no Razorpay ids. */
  async function upiOrder() {
    const order = await prisma.order.create({
      data: {
        orderNumber: `SPEC-MR-${randomUUID().slice(0, 8)}`,
        userId,
        status: OrderStatus.PAID,
        subtotalAmountMinor: PRICE,
        discountAmountMinor: 0n,
        taxAmountMinor: 0n,
        totalAmountMinor: PRICE,
        currency: 'INR',
        customerEmail: 'payment-spec@jsmf.test',
        paidAt: new Date(Date.now() - 86_400_000),
        items: {
          create: {
            productId,
            productTitleSnapshot: 'Payment Spec Product',
            productTypeSnapshot: ProductType.PDF,
            unitPriceAmountMinor: PRICE,
            quantity: 1,
            totalAmountMinor: PRICE,
          },
        },
        payments: {
          create: {
            provider: 'OFFLINE',
            status: PaymentStatus.CAPTURED,
            method: 'upi',
            amountMinor: PRICE,
            currency: 'INR',
            capturedAt: new Date(Date.now() - 86_400_000),
          },
        },
      },
    });
    await entitlements.grant({ userId, productId, source: 'PURCHASE', sourceOrderId: order.id });
    return order;
  }

  const manual = (overrides: Partial<Parameters<typeof payments.recordManualRefund>[2]> = {}) => ({
    amountMinor: PRICE,
    method: 'UPI' as const,
    reference: 'UTR123456789',
    refundedAt: new Date(),
    revokeAccess: true,
    notifyBuyer: true,
    ...overrides,
  });

  const refundMails = () => sentMail.filter((m) => m.tag === 'refund-confirmation');
  const orderRow = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });

  it('refunds part through Razorpay, keeping access by default, then the rest revokes it', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    await pay(checkout);
    sentMail.length = 0;

    const first = await payments.refund(checkout.orderId, userId, 'goodwill', 'NORMAL', { amountMinor: 10000n });
    expect(first).toMatchObject({ status: OrderStatus.PARTIALLY_REFUNDED, accessRevoked: false });
    expect((await orderRow(checkout.orderId)).status).toBe(OrderStatus.PARTIALLY_REFUNDED);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
    expect(refundMails().at(-1)?.text).toMatch(/Part of your payment has been refunded[\s\S]*still in your JSMF account/);

    const rest = await payments.refund(checkout.orderId, userId, 'the rest');
    expect(rest).toMatchObject({ status: OrderStatus.REFUNDED, accessRevoked: true });
    const amounts = (await prisma.refund.findMany({ where: { orderId: checkout.orderId } })).map((r) => r.amountMinor);
    expect(amounts.reduce((a, b) => a + b, 0n)).toBe(PRICE);
    expect(await entitlements.findActive(userId, productId)).toBeNull();
  });

  it('does not tell the buyer they still have access when it was revoked earlier', async () => {
    await clearEntitlement();
    const order = await upiOrder();
    await payments.recordManualRefund(order.id, userId, manual({ amountMinor: 10000n, revokeAccess: false, notifyBuyer: false }));
    await payments.revokeAccess(order.id, userId);
    sentMail.length = 0;

    await payments.recordManualRefund(order.id, userId, manual({ amountMinor: PRICE - 10000n, revokeAccess: false }));
    expect(refundMails().at(-1)?.text).toMatch(/no longer available/);
  });

  it('refunds in full but keeps access when asked, and access can be revoked later', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    await pay(checkout);

    await payments.refund(checkout.orderId, userId, 'keep it', 'NORMAL', { revokeAccess: false });
    expect((await orderRow(checkout.orderId)).status).toBe(OrderStatus.REFUNDED);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();

    await expect(payments.refund(checkout.orderId, userId)).rejects.toThrow(/already been refunded in full/);

    const revoked = await payments.revokeAccess(checkout.orderId, userId, 'changed my mind');
    expect(revoked.revoked).toBe(1);
    expect(await entitlements.findActive(userId, productId)).toBeNull();
    await expect(payments.revokeAccess(checkout.orderId, userId)).rejects.toThrow(/does not give access/);
  });

  it('refuses more than is left, and changes nothing', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    await pay(checkout);

    await expect(
      payments.refund(checkout.orderId, userId, undefined, 'NORMAL', { amountMinor: PRICE + 1n }),
    ).rejects.toThrow(/Only ₹499 is left/);
    expect((await orderRow(checkout.orderId)).status).toBe(OrderStatus.PAID);
    expect(await prisma.refund.count({ where: { orderId: checkout.orderId } })).toBe(0);
  });

  it('records a partial UPI refund on a hand-recorded order, revoking access as chosen', async () => {
    await clearEntitlement();
    const order = await upiOrder();
    sentMail.length = 0;

    const result = await payments.recordManualRefund(order.id, userId, manual({ amountMinor: 20000n }));
    expect(result).toMatchObject({ status: OrderStatus.PARTIALLY_REFUNDED, accessRevoked: true });

    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id } });
    expect(refund).toMatchObject({ manualMethod: 'UPI', reference: 'UTR123456789', providerRefundId: null, status: 'PROCESSED' });
    expect(await entitlements.findActive(userId, productId)).toBeNull();

    const mail = refundMails().at(-1)!;
    expect(mail.text).toMatch(/by UPI on/);
    expect(mail.text).toMatch(/Reference: UTR123456789/);
    expect(mail.text).toMatch(/no longer available/);

    // Recording the rest completes it, and sends nothing when told not to.
    const before = refundMails().length;
    const rest = await payments.recordManualRefund(
      order.id,
      userId,
      manual({ amountMinor: PRICE - 20000n, notifyBuyer: false }),
    );
    expect(rest.status).toBe(OrderStatus.REFUNDED);
    expect(refundMails()).toHaveLength(before);
  });

  it('records a manual refund on a Razorpay order without calling Razorpay', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    await pay(checkout);

    await payments.recordManualRefund(
      checkout.orderId,
      userId,
      manual({ revokeAccess: false, method: 'BANK_TRANSFER', reference: undefined }),
    );
    expect((await orderRow(checkout.orderId)).status).toBe(OrderStatus.REFUNDED);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: checkout.orderId } });
    expect(refund.providerRefundId).toBeNull();
    expect(refund.manualMethod).toBe('BANK_TRANSFER');
  });

  it('refuses a manual refund over what is left, dated in the future, before payment, or of zero', async () => {
    await clearEntitlement();
    const order = await upiOrder();

    await expect(payments.recordManualRefund(order.id, userId, manual({ amountMinor: PRICE + 1n }))).rejects.toThrow(
      /Only ₹499 is left/,
    );
    await expect(
      payments.recordManualRefund(order.id, userId, manual({ refundedAt: new Date(Date.now() + 86_400_000) })),
    ).rejects.toThrow(/future/);
    await expect(
      payments.recordManualRefund(order.id, userId, manual({ refundedAt: new Date(Date.now() - 3 * 86_400_000) })),
    ).rejects.toThrow(/before the order was paid/);
    await expect(payments.recordManualRefund(order.id, userId, manual({ amountMinor: 0n }))).rejects.toThrow(
      /above zero/,
    );

    expect((await orderRow(order.id)).status).toBe(OrderStatus.PAID);
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();
  });

  it('lets only one of two simultaneous full manual refunds through', async () => {
    await clearEntitlement();
    const order = await upiOrder();

    const results = await Promise.allSettled([
      payments.recordManualRefund(order.id, userId, manual({ notifyBuyer: false })),
      payments.recordManualRefund(order.id, userId, manual({ notifyBuyer: false })),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const sum = await prisma.refund.aggregate({ where: { orderId: order.id }, _sum: { amountMinor: true } });
    expect(sum._sum.amountMinor).toBe(PRICE);
  });
});

describe('refunds made in the Razorpay dashboard', () => {
  /** The private webhook handler, fed the shape the adapter would hand it. */
  const applyDashboardRefund = (providerPaymentId: string, refundAmountMinor: bigint) =>
    (payments as unknown as { applyProviderRefund(event: unknown): Promise<void> }).applyProviderRefund({
      eventId: `evt_spec_${randomUUID()}`,
      eventType: 'refund.processed',
      normalizedType: 'REFUND_PROCESSED',
      providerPaymentId,
      providerRefundId: `rfnd_spec_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      refundAmountMinor,
      payload: {},
    });

  it('marks a partial dashboard refund as partially refunded and keeps access; the rest revokes it', async () => {
    await clearEntitlement();
    const checkout = await startCheckout();
    const providerPaymentId = await pay(checkout);

    await applyDashboardRefund(providerPaymentId, 10000n);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).status).toBe(
      OrderStatus.PARTIALLY_REFUNDED,
    );
    expect(await entitlements.findActive(userId, productId)).not.toBeNull();

    await applyDashboardRefund(providerPaymentId, PRICE - 10000n);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).status).toBe(OrderStatus.REFUNDED);
    expect(await entitlements.findActive(userId, productId)).toBeNull();
  });
});

describe('PDF bundles', () => {
  const BUNDLE_PRICE = 30000n;

  async function buyer(label: string) {
    const user = await prisma.user.create({
      data: { email: `bundle-${label}-${randomUUID()}@jsmf.test`, name: `Bundle ${label}`, status: UserStatus.ACTIVE },
    });
    created.userIds.push(user.id);
    return user;
  }

  async function pdf(label: string) {
    const product = await prisma.product.create({
      data: {
        slug: `bundle-pdf-${label}-${randomUUID()}`,
        title: `Bundle PDF ${label}`,
        type: ProductType.PDF,
        accessType: AccessType.PAID,
        status: ProductStatus.PUBLISHED,
        publishedAt: new Date(),
        priceAmountMinor: 9900n,
        currency: 'INR',
      },
    });
    created.productIds.push(product.id);
    await prisma.productAsset.create({
      data: {
        productId: product.id,
        kind: 'PRIMARY_FILE',
        storageProvider: 'LOCAL',
        bucket: 'private',
        objectKey: `spec/${product.id}.pdf`,
        originalFilename: `${label}.pdf`,
      },
    });
    return product;
  }

  /** A published bundle of three PDFs, ₹300. */
  async function bundleOfThree(actorId: string) {
    const parts = [await pdf('a'), await pdf('b'), await pdf('c')];
    const bundle = await prisma.product.create({
      data: {
        slug: `bundle-${randomUUID()}`,
        title: 'Revision bundle',
        type: ProductType.BUNDLE,
        accessType: AccessType.PAID,
        status: ProductStatus.DRAFT,
        priceAmountMinor: BUNDLE_PRICE,
        currency: 'INR',
      },
    });
    created.productIds.push(bundle.id);

    // Empty, it cannot go on sale.
    await expect(catalog.publish(bundle.id, { id: actorId })).rejects.toThrow(/no PDFs in it/);
    for (const part of parts) await bundles.add(bundle.id, { productId: part.id }, { id: actorId });
    await catalog.publish(bundle.id, { id: actorId });
    return { bundle, parts };
  }

  async function payFor(user: { id: string }, productId: string, amountMinor: bigint) {
    const result = await orders.checkout({ userId: user.id, productId, customerEmail: 'bundle@jsmf.test' });
    if (result.kind !== 'PAYMENT_REQUIRED') throw new Error('expected a paid checkout');
    expect(result.amountMinor).toBe(amountMinor);
    await deliver({
      providerOrderId: result.providerOrderId,
      amountMinor,
      providerPaymentId: `pay_stub_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
    });
    return result;
  }

  const active = (uid: string) =>
    prisma.entitlement.findMany({ where: { userId: uid, status: EntitlementStatus.ACTIVE } });

  it('sells its PDFs as one card in the library, and a refund takes them all back', async () => {
    const student = await buyer('full');
    const { bundle, parts } = await bundleOfThree(student.id);

    // Only PDFs, each once, never the bundle itself.
    await expect(bundles.add(bundle.id, { productId: bundle.id }, { id: student.id })).rejects.toThrow(
      /cannot contain itself/,
    );
    await expect(bundles.add(bundle.id, { productId: parts[0].id }, { id: student.id })).rejects.toThrow(
      /already in this bundle/,
    );

    const checkout = await payFor(student, bundle.id, BUNDLE_PRICE);

    const rows = await active(student.id);
    expect(rows.map((r) => r.productId).sort()).toEqual([bundle.id, ...parts.map((p) => p.id)].sort());
    for (const part of parts) {
      expect(rows.find((r) => r.productId === part.id)).toMatchObject({
        source: 'BUNDLE',
        sourceProductId: bundle.id,
        sourceOrderId: checkout.orderId,
      });
    }

    const library = await entitlements.listForUser(student.id);
    expect(library.map((r) => r.productId)).toEqual([bundle.id]);
    expect(library[0].contents?.map((c) => c.id)).toEqual(parts.map((p) => p.id));

    await payments.refund(checkout.orderId, student.id, 'spec');
    expect(await active(student.id)).toHaveLength(0);
  });

  it('charges a part-owner only for the PDFs they lack, and refuses one who has them all', async () => {
    const owner = await buyer('part');
    const { bundle, parts } = await bundleOfThree(owner.id);
    await entitlements.grant({ userId: owner.id, productId: parts[0].id, source: 'FREE_CLAIM' });

    const quote = await orders.bundleQuote(owner.id, bundle.id);
    expect(quote).toMatchObject({ priceMinor: '30000', payMinor: '20000', totalPdfs: 3, nothingToBuy: false });
    expect(quote.owned.map((o) => o.id)).toEqual([parts[0].id]);

    const checkout = await payFor(owner, bundle.id, 20000n);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    expect(order).toMatchObject({ subtotalAmountMinor: 30000n, discountAmountMinor: 10000n, totalAmountMinor: 20000n });
    // The PDF they had stays theirs as it was.
    const kept = (await active(owner.id)).find((r) => r.productId === parts[0].id);
    expect(kept?.source).toBe('FREE_CLAIM');

    const collector = await buyer('all');
    for (const part of parts) await entitlements.grant({ userId: collector.id, productId: part.id, source: 'FREE_CLAIM' });
    expect((await orders.bundleQuote(collector.id, bundle.id)).nothingToBuy).toBe(true);
    await expect(orders.checkout({ userId: collector.id, productId: bundle.id, customerEmail: null })).rejects.toThrow(
      /every PDF in this bundle/,
    );
  });

  it('lets the admin choose, per PDF, whether it is also sold on its own', async () => {
    const admin = await buyer('lister');
    const { bundle } = await bundleOfThree(admin.id);
    const shopper = await buyer('shopper');

    // Left alone, a store PDF stays in the store, and can still be bought singly.
    const both = await pdf('both');
    await bundles.add(bundle.id, { productId: both.id }, { id: admin.id });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: both.id } })).listed).toBe(true);
    const single = await orders.checkout({ userId: shopper.id, productId: both.id, customerEmail: null });
    expect(single.kind).toBe('PAYMENT_REQUIRED');

    // Chosen bundle-only: out of the store, so it can't be bought by itself.
    const only = await pdf('only');
    await bundles.add(bundle.id, { productId: only.id, sellOnItsOwn: false }, { id: admin.id });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: only.id } })).listed).toBe(false);
    await expect(orders.checkout({ userId: shopper.id, productId: only.id, customerEmail: null })).rejects.toThrow(
      /not found/i,
    );

    // And it can be put back on sale while still in the bundle.
    await catalog.update(only.id, { listed: true }, { id: admin.id });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: only.id } })).listed).toBe(true);
  });

  it('does not let a free PDF in the bundle take money off', async () => {
    const student = await buyer('free-claim');
    const { bundle, parts } = await bundleOfThree(student.id);
    const freebie = await pdf('free');
    await prisma.product.update({ where: { id: freebie.id }, data: { accessType: AccessType.FREE, priceAmountMinor: 0n } });
    await bundles.add(bundle.id, { productId: freebie.id }, { id: student.id });

    await entitlements.grant({ userId: student.id, productId: freebie.id, source: 'FREE_CLAIM' });
    expect(await orders.bundleQuote(student.id, bundle.id)).toMatchObject({
      payMinor: '30000',
      totalPdfs: 4,
      paidPdfs: 3,
      paidOwned: 0,
    });

    // A paid one does, at a third of the price.
    await entitlements.grant({ userId: student.id, productId: parts[0].id, source: 'FREE_CLAIM' });
    const quote = await orders.bundleQuote(student.id, bundle.id);
    expect(quote).toMatchObject({ payMinor: '20000', paidOwned: 1 });
    expect(quote.owned.map((o) => o.id)).toEqual([parts[0].id, freebie.id]);
  });

  it('keeps every holder on the current contents: added PDFs reach them, removed ones are taken back', async () => {
    const student = await buyer('later');
    const { bundle } = await bundleOfThree(student.id);
    const checkout = await payFor(student, bundle.id, BUNDLE_PRICE);

    // Someone who bought the PDF on its own before it was bundled.
    const loyal = await buyer('loyal');
    const added = await pdf('added');
    await entitlements.grant({ userId: loyal.id, productId: added.id, source: 'FREE_CLAIM' });

    const result = await bundles.add(bundle.id, { productId: added.id }, { id: student.id });
    expect(result).toMatchObject({ given: 1, holders: 1 });
    const grant = (await active(student.id)).find((r) => r.productId === added.id);
    expect(grant).toMatchObject({ source: 'BUNDLE', sourceProductId: bundle.id, sourceOrderId: checkout.orderId });

    const removed = await bundles.remove(bundle.id, added.id, { id: student.id });
    expect(removed.revoked).toBe(1);
    expect((await active(student.id)).map((r) => r.productId)).not.toContain(added.id);
    // Their own copy is not the bundle's to take.
    expect((await active(loyal.id)).map((r) => r.productId)).toContain(added.id);
  });

  it('does not take a PDF away while another of their bundles still has it', async () => {
    const student = await buyer('two-bundles');
    const { bundle: first } = await bundleOfThree(student.id);
    const { bundle: second } = await bundleOfThree(student.id);
    await payFor(student, first.id, BUNDLE_PRICE);
    await payFor(student, second.id, BUNDLE_PRICE);

    const shared = await pdf('shared');
    await bundles.add(first.id, { productId: shared.id }, { id: student.id });
    await bundles.add(second.id, { productId: shared.id }, { id: student.id });

    await bundles.remove(first.id, shared.id, { id: student.id });
    const row = (await active(student.id)).find((r) => r.productId === shared.id);
    expect(row).toMatchObject({ source: 'BUNDLE', sourceProductId: second.id });
  });
});

