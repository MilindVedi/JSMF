import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessType,
  OfflinePaymentMethod,
  OfflineSaleEntry,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  ProductStatus,
  ProductType,
  RefundStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { FinanceReportService } from './finance-report.service';

/**
 * The admin Finance view against real Postgres (dev stack). Sales and refunds
 * are written in March 2002 with explicit timestamps — no real data lives
 * there, and the website analytics spec uses 2001 — so exact figures can be
 * asserted. Every row created is deleted afterwards by its id.
 */
const prisma = new PrismaService();
const finance = new FinanceReportService(prisma);

const created = { userIds: [] as string[], productIds: [] as string[], orderIds: [] as string[] };
/** Noon India time on a March 2002 day. */
const at = (day: number) => new Date(`2002-03-${String(day).padStart(2, '0')}T06:30:00Z`);

async function product(type: ProductType, title: string, metadata: object = {}) {
  const row = await prisma.product.create({
    data: {
      slug: `finance-spec-${randomUUID()}`,
      title,
      type,
      accessType: AccessType.PAID,
      status: ProductStatus.PUBLISHED,
      priceAmountMinor: 100n,
      metadata,
    },
  });
  created.productIds.push(row.id);
  return row;
}

async function sale(input: {
  userId: string;
  product: { id: string; title: string; type: ProductType };
  listMinor: bigint;
  discountMinor?: bigint;
  day: number;
  offline?: OfflinePaymentMethod;
}) {
  const discount = input.discountMinor ?? 0n;
  const total = input.listMinor - discount;
  const order = await prisma.order.create({
    data: {
      orderNumber: `FIN-SPEC-${randomUUID().slice(0, 12)}`,
      userId: input.userId,
      status: OrderStatus.PAID,
      subtotalAmountMinor: input.listMinor,
      discountAmountMinor: discount,
      totalAmountMinor: total,
      createdAt: at(input.day),
      paidAt: at(input.day),
      items: {
        create: {
          productId: input.product.id,
          productTitleSnapshot: input.product.title,
          productTypeSnapshot: input.product.type,
          unitPriceAmountMinor: input.listMinor,
          totalAmountMinor: input.listMinor,
        },
      },
      payments: {
        create: {
          provider: input.offline ? PaymentProvider.OFFLINE : PaymentProvider.RAZORPAY,
          status: PaymentStatus.CAPTURED,
          amountMinor: total,
          createdAt: at(input.day),
          capturedAt: at(input.day),
        },
      },
    },
    include: { payments: true },
  });
  created.orderIds.push(order.id);
  if (input.offline) {
    await prisma.offlineSale.create({
      data: {
        orderId: order.id,
        productId: input.product.id,
        userId: input.userId,
        method: input.offline,
        paidAt: at(input.day),
        entry: OfflineSaleEntry.FORM,
      },
    });
  }
  return order;
}

beforeAll(async () => {
  const user = async (label: string) => {
    const row = await prisma.user.create({
      data: { email: `finance-spec-${label}-${randomUUID()}@jsmf.test`, name: 'Finance Spec', status: UserStatus.ACTIVE },
    });
    created.userIds.push(row.id);
    return row.id;
  };
  const [ana, ben, earlyBuyer] = await Promise.all([user('ana'), user('ben'), user('early')]);
  const [session, call, pdf, plan] = await Promise.all([
    product(ProductType.LIVE_SESSION, 'Finance Spec Session'),
    product(ProductType.MENTORSHIP, 'Finance Spec Call'),
    product(ProductType.PDF, 'Finance Spec PDF'),
    product(ProductType.COURSE, 'Finance Spec PYQ Plan', { pyqSubscription: true }),
  ]);

  // February: one earlier sale, so `earlyBuyer` is not new in March, and a
  // refund of it issued in March counts against March.
  const february = await sale({ userId: earlyBuyer, product: pdf, listMinor: 19_900n, day: 1 });
  await prisma.order.update({
    where: { id: february.id },
    data: { createdAt: new Date('2002-02-10T06:30:00Z'), paidAt: new Date('2002-02-10T06:30:00Z') },
  });

  // March: four sales across all four streams.
  const seat = await sale({ userId: ana, product: session, listMinor: 99_900n, day: 2 });
  await sale({ userId: ana, product: call, listMinor: 150_000n, day: 3, offline: OfflinePaymentMethod.UPI_DIRECT });
  await sale({ userId: ben, product: plan, listMinor: 50_000n, discountMinor: 10_000n, day: 3 });
  await sale({ userId: earlyBuyer, product: pdf, listMinor: 19_900n, day: 5 });

  // Refunds in March: part of the seat (processed), all of the February PDF
  // (still pending at the provider), and a failed one that must not count.
  await prisma.refund.createMany({
    data: [
      {
        paymentId: seat.payments[0].id,
        orderId: seat.id,
        amountMinor: 30_000n,
        status: RefundStatus.PROCESSED,
        createdAt: at(4),
        processedAt: at(4),
      },
      {
        paymentId: february.payments[0].id,
        orderId: february.id,
        amountMinor: 19_900n,
        status: RefundStatus.PENDING,
        createdAt: at(6),
      },
      {
        paymentId: seat.payments[0].id,
        orderId: seat.id,
        amountMinor: 5_000n,
        status: RefundStatus.FAILED,
        createdAt: at(6),
      },
    ],
  });

  // A checkout that was started in March and never paid.
  const abandoned = await prisma.order.create({
    data: {
      orderNumber: `FIN-SPEC-${randomUUID().slice(0, 12)}`,
      userId: ben,
      status: OrderStatus.AWAITING_PAYMENT,
      subtotalAmountMinor: 99_900n,
      totalAmountMinor: 99_900n,
      createdAt: at(7),
      items: {
        create: {
          productId: session.id,
          productTitleSnapshot: session.title,
          productTypeSnapshot: ProductType.LIVE_SESSION,
          unitPriceAmountMinor: 99_900n,
          totalAmountMinor: 99_900n,
        },
      },
      payments: {
        create: { provider: PaymentProvider.RAZORPAY, status: PaymentStatus.FAILED, amountMinor: 99_900n, createdAt: at(7) },
      },
    },
  });
  created.orderIds.push(abandoned.id);
});

afterAll(async () => {
  const orderId = { in: created.orderIds };
  await prisma.refund.deleteMany({ where: { orderId } });
  await prisma.offlineSale.deleteMany({ where: { orderId } });
  await prisma.payment.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
});

describe('FinanceReportService', () => {
  it('adds up sales, discounts and refunds for the range', async () => {
    const summary = await finance.summary({ from: '2002-03-01', to: '2002-03-31' });

    // 99,900 + 150,000 + 40,000 + 19,900 collected; 30,000 + 19,900 refunded.
    expect(summary.totals).toEqual({
      grossMinor: '309800',
      discountMinor: '10000',
      taxMinor: '0',
      refundedMinor: '49900',
      refundPendingMinor: '19900',
      netMinor: '259900',
      paidOrders: 4,
      freeOrders: 0,
      refunds: 2,
      payingBuyers: 3,
      newBuyers: 2,
    });
    expect(summary.bucket).toBe('day');
    expect(summary.series).toHaveLength(31);
    expect(summary.series[2]).toEqual({ bucket: '2002-03-03', grossMinor: '190000', refundedMinor: '0', orders: 2 });
    expect(summary.series[3]).toEqual({ bucket: '2002-03-04', grossMinor: '0', refundedMinor: '30000', orders: 0 });

    // February held the one earlier sale, and nothing was refunded then.
    expect(summary.previous).toMatchObject({ grossMinor: '19900', refundedMinor: '0', paidOrders: 1 });
  });

  it('splits money by stream, channel, refund method, product and checkout', async () => {
    const summary = await finance.summary({ from: '2002-03-01', to: '2002-03-31' });

    expect(summary.byStream).toEqual([
      { stream: 'MENTORSHIP', orders: 1, grossMinor: '150000', refundedMinor: '0', netMinor: '150000' },
      { stream: 'LIVE_SESSION', orders: 1, grossMinor: '99900', refundedMinor: '30000', netMinor: '69900' },
      { stream: 'PYQ_PLAN', orders: 1, grossMinor: '40000', refundedMinor: '0', netMinor: '40000' },
      { stream: 'STORE', orders: 1, grossMinor: '19900', refundedMinor: '19900', netMinor: '0' },
    ]);
    expect(summary.byChannel).toEqual([
      { channel: 'RAZORPAY_CHECKOUT', orders: 3, grossMinor: '159800' },
      { channel: 'UPI_DIRECT', orders: 1, grossMinor: '150000' },
    ]);
    expect(summary.refundsByMethod).toEqual([
      { method: 'RAZORPAY', refunds: 2, amountMinor: '49900', pendingMinor: '19900' },
    ]);
    expect(summary.topProducts.map((row) => [row.title, row.units, row.netMinor])).toEqual([
      ['Finance Spec Call', 1, '150000'],
      ['Finance Spec Session', 1, '69900'],
      ['Finance Spec PYQ Plan', 1, '40000'],
      ['Finance Spec PDF', 1, '0'],
    ]);
    // Offline sales never went through checkout: 3 checkout orders paid, 1 abandoned.
    expect(summary.checkout).toEqual({ started: 4, paid: 3, abandoned: 1, failedPayments: 1 });
  });

  it('buckets long ranges by month and refuses bad ranges', async () => {
    const year = await finance.summary({ from: '2002-01-01', to: '2002-12-31' });
    expect(year.bucket).toBe('month');
    expect(year.series).toHaveLength(12);
    expect(year.series[2]).toMatchObject({ bucket: '2002-03-01', grossMinor: '309800', orders: 4 });

    await expect(finance.summary({ from: '2002-03-10', to: '2002-03-01' })).rejects.toThrow();
    await expect(finance.summary({ from: '1990-01-01', to: '2002-01-01' })).rejects.toThrow();
  });

  it('all time starts at the first sale and has no previous period', async () => {
    const summary = await finance.summary({ all: true });
    expect(summary.previous).toBeNull();
    expect(summary.from <= '2002-02-10' || summary.from > '2002-03-31').toBe(true);
    expect(BigInt(summary.lifetime.grossMinor)).toBeGreaterThanOrEqual(309_800n);
  });
});
