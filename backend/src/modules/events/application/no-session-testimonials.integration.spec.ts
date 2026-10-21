import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QuoteLayout, StorageProvider, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ProductService } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OrderService } from '../../orders/application/order.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { LiveSessionService } from './live-session.service';
import { SessionShowcase, type SectionQuote } from './session-showcase';
import {
  NO_SESSION_DEFAULT_SUBHEADING,
  NO_SESSION_HEADING_OPTIONS,
  NoSessionTestimonialsService,
} from './no-session-testimonials.service';

/**
 * The home page's testimonials while no session is upcoming, against a real
 * Postgres. The settings row and the picked screenshots are shared with local
 * development, so they are put back as they were afterwards.
 */

const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') return 'test-stub-secret-at-least-16-chars';
    return process.env[key];
  },
} as never;
// The signed URL names the object, so a test can tell whose screenshots came back.
const storage = {
  getSignedDownloadUrl: (ref: { objectKey: string }) => Promise.resolve(`https://example.test/${ref.objectKey}`),
} as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const entitlements = new EntitlementService(prisma);
const products = new ProductService(prisma, audit);
const orders = new OrderService(prisma, new StubPaymentAdapter(config), entitlements);
const sessions = new LiveSessionService(prisma, products, orders, entitlements, audit, storage, config);
// The feedback module's real quotes are covered in its own spec; a stand-in here.
let bandQuotes: SectionQuote[] = [];
const showcase = new SessionShowcase();
showcase.register({ quotesFor: () => Promise.resolve(new Map()), noSessionQuotes: () => Promise.resolve(bandQuotes) });
const service = new NoSessionTestimonialsService(prisma, storage, audit, config, showcase);

const tag = randomUUID().slice(0, 8);
const created = { productIds: [] as string[], userId: '' };
const admin = () => ({ id: created.userId });
let saved: Record<string, unknown>;
let savedScreenshots: Array<{ testimonialId: string; sortOrder: number }>;

/** A published session whose first day began `minutesAgo` ago, with `shots` screenshots. */
async function pastSession(label: string, minutesAgo: number, shots: number) {
  const session = await sessions.create(
    {
      title: `No-session spec ${label} ${tag}`,
      tagline: 'A test session',
      days: [{ startsAt: new Date(Date.now() + 48 * 3600_000).toISOString(), durationMinutes: 60 }],
      platformLabel: 'Live on Zoom',
      priceAmountMinor: '9900',
      highlights: ['One'],
    },
    admin(),
  );
  created.productIds.push(session.id);
  await sessions.publish(session.id, admin());
  await sessions.update(
    session.id,
    { days: [{ startsAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), durationMinutes: 60 }] },
    admin(),
  );
  for (let i = 0; i < shots; i++) {
    await prisma.sessionTestimonial.create({
      data: {
        liveSessionId: session.id,
        storageProvider: StorageProvider.LOCAL,
        bucket: 'public',
        objectKey: `spec/${label}-${tag}-${i}.png`,
        sortOrder: i,
      },
    });
  }
  return session.id;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `no-session-admin-${tag}@jsmf.test`, name: 'Admin', status: UserStatus.ACTIVE },
  });
  created.userId = user.id;
  const row = await prisma.platformSettings.upsert({ where: { id: 'global' }, create: { id: 'global' }, update: {} });
  saved = {
    noSessionTestimonialsEnabled: row.noSessionTestimonialsEnabled,
    noSessionTestimonialsSessionId: row.noSessionTestimonialsSessionId,
    noSessionTestimonialsHeading: row.noSessionTestimonialsHeading,
    noSessionTestimonialsSubheading: row.noSessionTestimonialsSubheading,
    noSessionTestimonialsHandPicked: row.noSessionTestimonialsHandPicked,
    quotesLayout: row.quotesLayout,
  };
  savedScreenshots = await prisma.noSessionScreenshot.findMany({ select: { testimonialId: true, sortOrder: true } });
  // handPicked explicitly off: the row is shared with local development, where
  // it may well be on, and the first test is about the one-session behaviour.
  await service.update(
    { enabled: true, sessionId: null, handPicked: false, quotesLayout: QuoteLayout.SCROLL, heading: null, subheading: null },
    admin(),
  );
});

afterAll(async () => {
  await prisma.platformSettings.update({ where: { id: 'global' }, data: saved });
  await prisma.noSessionScreenshot.deleteMany({});
  await prisma.noSessionScreenshot.createMany({ data: savedScreenshots, skipDuplicates: true });
  await prisma.sessionTestimonial.deleteMany({ where: { liveSessionId: { in: created.productIds } } });
  await prisma.liveSessionDay.deleteMany({ where: { liveSessionId: { in: created.productIds } } });
  await prisma.liveSession.deleteMany({ where: { productId: { in: created.productIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: created.userId } });
  await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await prisma.user.delete({ where: { id: created.userId } });
  await prisma.$disconnect();
});

describe('testimonials while no session is upcoming', () => {
  it("shows the latest past session's screenshots with the default copy, or a chosen session's, or nothing", async () => {
    const older = await pastSession('older', 600, 1);
    const latest = await pastSession('latest', 1, 2);
    await pastSession('empty', 0.5, 0); // more recent, but nothing to show

    const auto = await service.forWebsite();
    expect(auto).toMatchObject({ heading: NO_SESSION_HEADING_OPTIONS[0], subheading: NO_SESSION_DEFAULT_SUBHEADING });
    expect(auto?.urls).toEqual([0, 1].map((i) => `https://example.test/spec/latest-${tag}-${i}.png`));

    const forAdmin = await service.forAdmin();
    expect(forAdmin.automaticSessionId).toBe(latest);
    expect(forAdmin.sessions.map((s) => s.id)).toEqual(expect.arrayContaining([older, latest]));
    expect(forAdmin.headingOptions).toEqual([...NO_SESSION_HEADING_OPTIONS]);

    await service.update(
      { sessionId: older, heading: '  Feedbacks from previous sessions, edited.  ', subheading: 'Our own words.' },
      admin(),
    );
    const chosen = await service.forWebsite();
    expect(chosen).toMatchObject({ heading: 'Feedbacks from previous sessions, edited.', subheading: 'Our own words.' });
    expect(chosen?.urls).toEqual([`https://example.test/spec/older-${tag}-0.png`]);

    // A cleared field goes back to the default text.
    await service.update({ heading: '', subheading: null }, admin());
    expect(await service.forWebsite()).toMatchObject({
      heading: NO_SESSION_HEADING_OPTIONS[0],
      subheading: NO_SESSION_DEFAULT_SUBHEADING,
    });

    await service.update({ enabled: false }, admin());
    expect(await service.forWebsite()).toBeNull();
  });

  it('hand-picked: chosen screenshots from several sessions in the chosen order, plus picked quotes', async () => {
    await service.update({ enabled: true, handPicked: false }, admin());
    const a = await pastSession('pick-a', 30, 2);
    const b = await pastSession('pick-b', 20, 1);
    const shots = await prisma.sessionTestimonial.findMany({
      where: { liveSessionId: { in: [a, b] } },
      orderBy: { objectKey: 'asc' },
    });
    const [a0, a1, b0] = shots;

    const admin1 = await service.setScreenshots([b0.id, a1.id], admin());
    expect(admin1.screenshots.map((s) => s.testimonialId)).toEqual([b0.id, a1.id]);
    expect(admin1.screenshots[0].sessionId).toBe(b);
    expect(admin1.pickableSessions.map((s) => s.id)).toEqual(expect.arrayContaining([a, b]));

    // Not switched over yet: the band still shows one gallery, with no quotes.
    expect((await service.forWebsite())?.quotes).toEqual([]);

    bandQuotes = [{ id: 'q1', quote: 'Loved it.', attribution: 'Riya', rating: null }];
    await service.update({ handPicked: true }, admin());
    const picked = await service.forWebsite();
    expect(picked?.urls).toEqual([b0.objectKey, a1.objectKey].map((key) => `https://example.test/${key}`));
    expect(picked?.quotes).toEqual(bandQuotes);
    expect(a0).toBeDefined();

    // Quotes alone are enough to show the band; nothing at all hides it.
    await service.setScreenshots([], admin());
    expect((await service.forWebsite())?.urls).toEqual([]);
    bandQuotes = [];
    expect(await service.forWebsite()).toBeNull();

    // A deleted screenshot drops out on its own; an unknown or repeated id is refused.
    await service.setScreenshots([a0.id], admin());
    await prisma.sessionTestimonial.delete({ where: { id: a0.id } });
    expect((await service.forAdmin()).screenshots).toEqual([]);
    await expect(service.setScreenshots([a0.id], admin())).rejects.toThrow(/no longer exists/);
    await expect(service.setScreenshots([a1.id, a1.id], admin())).rejects.toThrow(/once/);

    await service.update({ handPicked: false }, admin());
  });

  it('remembers how the replies should be laid out, for the whole website', async () => {
    const fresh = await service.forAdmin();
    expect(fresh.quotesLayoutOptions).toEqual([QuoteLayout.SCROLL, QuoteLayout.GRID]);
    expect(fresh.quotesLayout).toBe(QuoteLayout.SCROLL);
    expect(await service.quotesLayout()).toBe(QuoteLayout.SCROLL);

    await service.update({ quotesLayout: QuoteLayout.GRID }, admin());
    expect(await service.quotesLayout()).toBe(QuoteLayout.GRID);
    // Changing something else leaves it alone.
    await service.update({ heading: 'Still grid.' }, admin());
    expect((await service.forAdmin()).quotesLayout).toBe(QuoteLayout.GRID);
    await service.update({ quotesLayout: QuoteLayout.SCROLL, heading: null }, admin());
    expect(await service.quotesLayout()).toBe(QuoteLayout.SCROLL);
  });

  it('refuses a session with nothing to show', async () => {
    const empty = await pastSession('refused', 5, 0);
    await expect(service.update({ sessionId: empty }, admin())).rejects.toThrow(/no testimonials/);
  });
});
