import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessType,
  JsmfApp,
  OrderStatus,
  ProductStatus,
  ProductType,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MAX_EVENTS_PER_BATCH } from '../domain/analytics-event';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { AnalyticsReportService } from './analytics-report.service';

/**
 * Website analytics against real Postgres (dev stack): what the ingest keeps
 * and drops, the off switch, and the admin summary's numbers.
 *
 * The summary is checked on a range in January 2001, where this spec writes
 * its own events, account and order with explicit timestamps — no real data
 * lives there, so exact numbers can be asserted. Every row created is deleted
 * afterwards by its id (or by a visitor id generated here).
 */
let enabled = true;
const config = {
  get(key: string) {
    if (key === 'ANALYTICS_ENABLED') return enabled;
    return process.env[key];
  },
} as never;

const prisma = new PrismaService();
const ingest = new AnalyticsIngestService(prisma, config);
const reports = new AnalyticsReportService(prisma);

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

const visitorIds: string[] = [];
const created = { userIds: [] as string[], productIds: [] as string[], orderIds: [] as string[] };

function visitor(): string {
  const id = randomUUID();
  visitorIds.push(id);
  return id;
}

const event = (visitorId: string, name = 'page_view', extra: Record<string, unknown> = {}) => ({
  name,
  path: '/',
  visitorId,
  sessionId: 'spec-session-1',
  ...extra,
});

const rowsOf = (visitorId: string) =>
  prisma.analyticsEvent.findMany({ where: { visitorId }, orderBy: { id: 'asc' } });

afterAll(async () => {
  await prisma.analyticsEvent.deleteMany({ where: { visitorId: { in: visitorIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: created.orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } });
  await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
});

describe('analytics ingest', () => {
  it('keeps allowlisted events, cleans their fields, and silently drops the rest', async () => {
    const id = visitor();
    const stored = await ingest.ingest(
      {
        events: [
          event(id, 'page_view', {
            path: '/prep-kit?utm_source=x#top',
            referrer: 'https://www.google.com/search?q=private+words',
            utm: { source: 'telegram', medium: 'social', campaign: 'oct' },
            props: { location: 'hero' },
          }),
          event(id, 'drop_table_users'),
          event(id, 'book_click', { visitorId: 'not-a-uuid' }),
          event(id, 'book_click', { path: 'https://evil.example/' }),
          event(id, 'book_click', { sessionId: 'x' }),
        ],
      },
      { userId: null, userAgent: IPHONE },
    );

    expect(stored).toBe(1);
    const [row] = await rowsOf(id);
    expect(row).toMatchObject({
      app: JsmfApp.MAIN,
      name: 'page_view',
      path: '/prep-kit',
      referrer: 'www.google.com/search',
      utmSource: 'telegram',
      utmMedium: 'social',
      utmCampaign: 'oct',
      props: { location: 'hero' },
      deviceType: 'mobile',
      userId: null,
    });
  });

  it('accepts a text/plain body (sendBeacon) and ignores one that is not JSON', async () => {
    const id = visitor();
    const body = JSON.stringify({ events: [event(id, 'checkout_open')] });
    expect(await ingest.ingest(body, { userId: null, userAgent: DESKTOP })).toBe(1);
    expect(await ingest.ingest('{not json', { userId: null, userAgent: DESKTOP })).toBe(0);
    expect(await ingest.ingest(undefined, { userId: null, userAgent: DESKTOP })).toBe(0);
    expect((await rowsOf(id)).map((r) => [r.name, r.deviceType])).toEqual([['checkout_open', 'desktop']]);
  });

  it(`stores at most ${MAX_EVENTS_PER_BATCH} events from one request`, async () => {
    const id = visitor();
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH + 5 }, () => event(id));
    expect(await ingest.ingest({ events }, { userId: null, userAgent: DESKTOP })).toBe(MAX_EVENTS_PER_BATCH);
    expect(await prisma.analyticsEvent.count({ where: { visitorId: id } })).toBe(MAX_EVENTS_PER_BATCH);
  });

  it('keeps the event but drops props that are nested, oversized or oddly keyed', async () => {
    const id = visitor();
    await ingest.ingest(
      {
        events: [
          event(id, 'outbound_click', { props: { target: { nested: true } } }),
          event(id, 'outbound_click', { props: { target: 'x'.repeat(150), a: 'y'.repeat(190), b: 'z'.repeat(190), c: 'q'.repeat(190), d: 'r'.repeat(190), e: 's'.repeat(190), f: 't'.repeat(190), g: 'u'.repeat(190), h: 'v'.repeat(190), i: 'w'.repeat(190), j: 'k'.repeat(190), k: 'l'.repeat(190) } }),
          event(id, 'outbound_click', { props: { 'bad key': 1 } }),
          event(id, 'outbound_click', { props: { target: 'youtube' } }),
        ],
      },
      { userId: null, userAgent: DESKTOP },
    );
    expect((await rowsOf(id)).map((r) => r.props)).toEqual([null, null, null, { target: 'youtube' }]);
  });

  it('stores nothing from crawlers or when ANALYTICS_ENABLED is off', async () => {
    const id = visitor();
    expect(await ingest.ingest({ events: [event(id)] }, { userId: null, userAgent: 'Googlebot/2.1' })).toBe(0);
    expect(await ingest.ingest({ events: [event(id)] }, { userId: null, userAgent: undefined })).toBe(0);

    enabled = false;
    try {
      expect(await ingest.ingest({ events: [event(id)] }, { userId: null, userAgent: DESKTOP })).toBe(0);
    } finally {
      enabled = true;
    }
    expect(await prisma.analyticsEvent.count({ where: { visitorId: id } })).toBe(0);
  });

  it('refuses an unknown app outright and links a signed-in user', async () => {
    const id = visitor();
    expect(await ingest.ingest({ app: 'NOPE', events: [event(id)] }, { userId: null, userAgent: DESKTOP })).toBe(0);

    const user = await prisma.user.create({
      data: { email: `analytics-spec-${randomUUID()}@jsmf.test`, name: 'Analytics Spec', status: UserStatus.ACTIVE },
    });
    created.userIds.push(user.id);
    expect(await ingest.ingest({ app: 'STORE', events: [event(id)] }, { userId: user.id, userAgent: DESKTOP })).toBe(1);
    expect((await rowsOf(id))[0]).toMatchObject({ app: JsmfApp.STORE, userId: user.id });
  });
});

describe('analytics summary', () => {
  // India is UTC+5:30, so 18:30Z is midnight there.
  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    const [a, b, c] = [visitor(), visitor(), visitor()];
    const base = { app: JsmfApp.MAIN, sessionId: 'spec-summary', deviceType: 'desktop', path: '/' };

    await prisma.analyticsEvent.createMany({
      data: [
        // 23:59 on 1 Jan in India — must land on 1 Jan, not 2 Jan.
        { ...base, visitorId: a, name: 'page_view', occurredAt: at('2001-01-01T18:29:00Z'), referrer: 'www.google.com/search', utmSource: 'telegram', utmMedium: 'social' },
        // 00:01 on 2 Jan in India.
        { ...base, visitorId: a, name: 'page_view', path: '/prep-kit', occurredAt: at('2001-01-01T18:31:00Z') },
        { ...base, visitorId: a, name: 'book_click', occurredAt: at('2001-01-01T18:32:00Z') },
        { ...base, visitorId: a, name: 'register_open', occurredAt: at('2001-01-01T18:33:00Z') },
        { ...base, visitorId: a, name: 'checkout_open', occurredAt: at('2001-01-01T18:34:00Z') },
        { ...base, visitorId: a, name: 'payment_success', occurredAt: at('2001-01-01T18:35:00Z') },
        { ...base, visitorId: b, name: 'page_view', deviceType: 'mobile', occurredAt: at('2001-01-02T06:00:00Z'), referrer: 'www.google.com/' },
        { ...base, visitorId: b, name: 'book_click', deviceType: 'mobile', occurredAt: at('2001-01-02T06:01:00Z') },
        { ...base, visitorId: c, name: 'page_view', deviceType: 'mobile', occurredAt: at('2001-01-05T06:00:00Z') },
        // Outside the range, and another app: neither may be counted.
        { ...base, visitorId: c, name: 'page_view', occurredAt: at('2001-01-08T06:00:00Z') },
        { ...base, visitorId: c, name: 'page_view', app: JsmfApp.STORE, occurredAt: at('2001-01-03T06:00:00Z') },
      ],
    });

    const buyer = await prisma.user.create({
      data: {
        email: `analytics-spec-${randomUUID()}@jsmf.test`,
        name: 'Analytics Spec',
        status: UserStatus.ACTIVE,
        createdAt: at('2001-01-02T05:00:00Z'),
      },
    });
    created.userIds.push(buyer.id);

    const product = await prisma.product.create({
      data: {
        slug: `analytics-spec-${randomUUID()}`,
        title: 'Analytics Spec Session',
        type: ProductType.LIVE_SESSION,
        accessType: AccessType.PAID,
        status: ProductStatus.DRAFT,
        priceAmountMinor: 49_900n,
      },
    });
    created.productIds.push(product.id);

    const order = await prisma.order.create({
      data: {
        orderNumber: `SPEC-${randomUUID().slice(0, 18)}`,
        userId: buyer.id,
        status: OrderStatus.PAID,
        subtotalAmountMinor: 49_900n,
        totalAmountMinor: 49_900n,
        createdAt: at('2001-01-02T05:10:00Z'),
        paidAt: at('2001-01-02T05:12:00Z'),
        items: {
          create: {
            productId: product.id,
            productTitleSnapshot: product.title,
            productTypeSnapshot: ProductType.LIVE_SESSION,
            unitPriceAmountMinor: 49_900n,
            totalAmountMinor: 49_900n,
          },
        },
      },
    });
    created.orderIds.push(order.id);
  });

  it('counts visitors, page views, the funnel and server truth per India day', async () => {
    const summary = await reports.summary({ from: '2001-01-01', to: '2001-01-07', app: JsmfApp.MAIN });

    expect(summary.totals).toEqual({ visitors: 3, sessions: 1, pageViews: 4, events: 9 });
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.slice(0, 3)).toEqual([
      { day: '2001-01-01', visitors: 1, pageViews: 1 },
      { day: '2001-01-02', visitors: 2, pageViews: 2 },
      { day: '2001-01-03', visitors: 0, pageViews: 0 },
    ]);
    expect(summary.daily[4]).toEqual({ day: '2001-01-05', visitors: 1, pageViews: 1 });
    expect(summary.funnel).toEqual([
      { step: 'page_view', visitors: 3 },
      { step: 'book_click', visitors: 2 },
      { step: 'register_open', visitors: 1 },
      { step: 'checkout_open', visitors: 1 },
      { step: 'payment_success', visitors: 1 },
    ]);
    expect(summary.server).toEqual({ usersCreated: 1, ordersCreated: 1, ordersPaid: 1, paidAmountMinor: '49900' });
    expect(summary.topPaths).toEqual([
      { path: '/', views: 3, visitors: 3 },
      { path: '/prep-kit', views: 1, visitors: 1 },
    ]);
    expect(summary.topReferrers).toEqual([{ referrer: 'www.google.com', visitors: 2 }]);
    expect(summary.topUtmSources).toEqual([{ source: 'telegram', medium: 'social', visitors: 1 }]);
    expect(summary.devices).toEqual([
      { deviceType: 'mobile', visitors: 2 },
      { deviceType: 'desktop', visitors: 1 },
    ]);

    // The live-session order is not a store order.
    const store = await reports.summary({ from: '2001-01-01', to: '2001-01-07', app: JsmfApp.STORE });
    expect(store.totals.pageViews).toBe(1);
    expect(store.server.ordersPaid).toBe(0);
  });

  it('defaults to the last 14 days and refuses bad or over-long ranges', async () => {
    const summary = await reports.summary({});
    expect(summary.daily).toHaveLength(14);
    expect(summary.daily.at(-1)?.day).toBe(summary.to);

    await expect(reports.summary({ from: '2001-01-01', to: '2001-12-31' })).rejects.toThrow(/180/);
    await expect(reports.summary({ from: '2001-02-30' })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(reports.summary({ from: '2001-01-05', to: '2001-01-01' })).rejects.toThrow(/after/);
  });
});
