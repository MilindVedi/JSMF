import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccessType,
  AssetKind,
  ContentAccessPurpose,
  EntitlementSource,
  EntitlementStatus,
  ProductType,
  StorageProvider,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { ProductService } from '../../catalog/application/product.service';
import { ContentAccessService } from '../../entitlements/application/content-access.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OfflineSaleHandlers } from '../../orders/application/offline-sale-handlers';
import { OfflineSaleService } from '../../orders/application/offline-sale.service';
import { OrderEvents } from '../../orders/application/order-events';
import { OrderService } from '../../orders/application/order.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { LiveSessionService } from './live-session.service';
import { SessionMaterialsService } from './session-materials.service';
import { SessionOfflineSaleHandler } from './session-offline-sale.handler';

/**
 * Day materials against a real Postgres, wired by hand like the other specs.
 * Buyers are recorded as offline sales so each one's payment time — which is
 * what "joined" means — is exact. Nothing here runs a global sweep.
 */

const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') return 'test-stub-secret-at-least-16-chars';
    if (key === 'STOREFRONT_URL') return 'http://localhost:3001';
    return process.env[key];
  },
} as never;

type Sent = { to: { email: string }; subject: string; text: string; tag?: string };
const sentMail: Sent[] = [];
const failNext = new Set<string>();
const mail = {
  sendBestEffort(request: Sent) {
    if (failNext.delete(request.to.email)) return Promise.resolve({ delivered: false as const, reason: 'error' });
    sentMail.push(request);
    return Promise.resolve({ delivered: true as const, messageId: 'test' });
  },
} as never;
const storage = { getSignedDownloadUrl: () => Promise.resolve('https://example.test/file.pdf') } as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const provider = new StubPaymentAdapter(config);
const entitlements = new EntitlementService(prisma);
const events = new OrderEvents();
const products = new ProductService(prisma, audit);
const orders = new OrderService(prisma, provider, entitlements);
const sessions = new LiveSessionService(prisma, products, orders, entitlements, audit, storage, config);
const access = new ContentAccessService(prisma, entitlements, storage, config);
const download = (request: { productId: string; userId: string | null }) =>
  access.grant({ ...request, purpose: ContentAccessPurpose.DOWNLOAD });
const materials = new SessionMaterialsService(prisma, entitlements, mail, config, audit, events, new SweepRegistry());
const handlers = new OfflineSaleHandlers();
new SessionOfflineSaleHandler(prisma, handlers, config, materials).onModuleInit();
const offline = new OfflineSaleService(prisma, entitlements, handlers, audit);

const tag = randomUUID().slice(0, 8);
const created = { userIds: [] as string[], productIds: [] as string[], emails: [] as string[] };
const HOUR = 3600_000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
let adminId: string;
const admin = () => ({ id: adminId });

async function createUser(label: string) {
  const email = `materials-${label}-${tag}@jsmf.test`;
  created.emails.push(email);
  const user = await prisma.user.create({ data: { email, name: `Person ${label}`, status: UserStatus.ACTIVE } });
  created.userIds.push(user.id);
  return user;
}

/** Day 1 already over (30h ago, 2h long); Day 2 tomorrow. */
async function createSession() {
  const session = await sessions.create(
    {
      title: `Materials spec ${randomUUID().slice(0, 6)}`,
      tagline: 'A test session',
      days: [
        { startsAt: inHours(48), durationMinutes: 120 },
        { startsAt: inHours(72), durationMinutes: 120 },
      ],
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
    {
      days: [
        { startsAt: hoursAgo(30), durationMinutes: 120 },
        { startsAt: inHours(24), durationMinutes: 120 },
      ],
    },
    admin(),
  );
  const view = await sessions.getForAdmin(session.id);
  return { id: session.id, day1: view.days[0].id, day2: view.days[1].id };
}

/** A store PDF with its file, optionally hidden from the store. */
async function createPdf(label: string, listed = true) {
  const product = await products.create(
    { title: `Handout ${label} ${tag}`, accessType: AccessType.FREE, priceAmountMinor: '0', listed },
    admin(),
  );
  created.productIds.push(product.id);
  await prisma.productAsset.create({
    data: {
      productId: product.id,
      kind: AssetKind.PRIMARY_FILE,
      storageProvider: StorageProvider.LOCAL,
      bucket: 'private',
      objectKey: `spec/${product.id}.pdf`,
      originalFilename: `${label}.pdf`,
    },
  });
  await products.publish(product.id, admin());
  return product;
}

/** A seat recorded by hand, paid at `paidAt`. */
async function seat(sessionId: string, label: string, paidAt: string) {
  const email = `materials-${label}-${tag}@jsmf.test`;
  created.emails.push(email);
  await offline.record(
    sessionId,
    [{ name: `Person ${label}`, email, amountPaidMinor: '9900', method: 'UPI_DIRECT', paidAt }],
    { userId: adminId, entry: 'FORM' },
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  created.userIds.push(user.id);
  return user;
}

const holds = async (userId: string, productId: string) =>
  (await entitlements.findActive(userId, productId)) !== null;

beforeAll(async () => {
  await prisma.$connect();
  adminId = (await createUser('admin')).id;
});

beforeEach(() => {
  sentMail.length = 0;
});

afterAll(async () => {
  const productIds = created.productIds;
  const users = await prisma.user.findMany({ where: { email: { in: created.emails } }, select: { id: true } });
  const userIds = [...new Set([...created.userIds, ...users.map((u) => u.id)])];
  await prisma.sessionMaterialNotice.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.sessionMaterial.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.productBundleItem.deleteMany({ where: { bundleProductId: { in: productIds } } });
  await prisma.offlineSale.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.sessionDayReminder.deleteMany({ where: { day: { liveSessionId: { in: productIds } } } });
  await prisma.sessionRegistration.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSessionDay.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSession.deleteMany({ where: { productId: { in: productIds } } });
  const orderIds = (await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((o) => o.id);
  await prisma.contentAccessEvent.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.entitlement.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...productIds, ...orderIds] } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.productAsset.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('session day materials', () => {
  it('gives a day PDF to seat holders at once, and late joiners earlier days by default', async () => {
    const session = await createSession();
    const notes1 = await createPdf('day1');
    const notes2 = await createPdf('day2');
    const early = await seat(session.id, 'early', hoursAgo(48)); // before day 1
    const late = await seat(session.id, 'late', hoursAgo(1)); // after day 1 ended

    await materials.add(session.id, { dayId: session.day1, productId: notes1.id }, admin());
    await materials.add(session.id, { dayId: session.day2, productId: notes2.id }, admin());

    for (const user of [early, late]) {
      expect(await holds(user.id, notes1.id)).toBe(true);
      expect(await holds(user.id, notes2.id)).toBe(true);
    }
    // Adding materials emails nobody.
    expect(sentMail).toHaveLength(0);

    // Shown in the library, labelled with the session it came from.
    const library = await entitlements.listForUser(late.id);
    const item = library.find((e) => e.productId === notes1.id)!;
    expect(item.source).toBe(EntitlementSource.SESSION_MATERIAL);
    expect(item.sourceProduct?.id).toBe(session.id);
  });

  it('withholds finished days from late joiners when the setting is off, and follows it when changed', async () => {
    const session = await createSession();
    const notes1 = await createPdf('d1-off');
    const notes2 = await createPdf('d2-off');
    await sessions.update(session.id, { lateJoinersGetEarlierMaterials: false }, admin());
    await materials.add(session.id, { dayId: session.day1, productId: notes1.id }, admin());
    await materials.add(session.id, { dayId: session.day2, productId: notes2.id }, admin());

    const early = await seat(session.id, 'early-off', hoursAgo(48));
    // Recorded after the materials: the offline sale itself gives them.
    const late = await seat(session.id, 'late-off', hoursAgo(1));

    expect(await holds(early.id, notes1.id)).toBe(true);
    expect(await holds(late.id, notes1.id)).toBe(false);
    expect(await holds(late.id, notes2.id)).toBe(true);

    await sessions.update(session.id, { lateJoinersGetEarlierMaterials: true }, admin());
    await materials.reconcile(session.id);
    expect(await holds(late.id, notes1.id)).toBe(true);

    await sessions.update(session.id, { lateJoinersGetEarlierMaterials: false }, admin());
    await materials.reconcile(session.id);
    expect(await holds(late.id, notes1.id)).toBe(false);
    expect(await holds(early.id, notes1.id)).toBe(true);
  });

  it('takes access back on removal and refund, but never from someone who bought the PDF', async () => {
    const session = await createSession();
    const notes = await createPdf('remove');
    const holder = await seat(session.id, 'holder', hoursAgo(48));
    const buyer = await seat(session.id, 'buyer', hoursAgo(48));
    // The buyer owned the PDF before it was a session material.
    await entitlements.grant({ userId: buyer.id, productId: notes.id, source: EntitlementSource.FREE_CLAIM });

    const overview = await materials.add(session.id, { dayId: session.day1, productId: notes.id }, admin());
    const materialId = overview.days[0].materials[0].id;
    expect(await holds(holder.id, notes.id)).toBe(true);

    await materials.remove(session.id, materialId, admin());
    expect(await holds(holder.id, notes.id)).toBe(false);
    expect(await holds(buyer.id, notes.id)).toBe(true);

    // A refunded seat takes its materials with it.
    await materials.add(session.id, { dayId: session.day1, productId: notes.id }, admin());
    expect(await holds(holder.id, notes.id)).toBe(true);
    const seatRow = await prisma.entitlement.findFirstOrThrow({
      where: { userId: holder.id, productId: session.id, status: EntitlementStatus.ACTIVE },
    });
    await entitlements.revokeForOrder(seatRow.sourceOrderId!, 'Refunded');
    expect(await holds(holder.id, notes.id)).toBe(false);
    expect(await holds(holder.id, session.id)).toBe(false);
  });

  it('takes several PDFs on one day: all reach the library, one email names them all, removing one keeps the rest', async () => {
    const session = await createSession();
    const notesA = await createPdf('same-day-a');
    const notesB = await createPdf('same-day-b');
    const notesC = await createPdf('same-day-c');
    const holder = await seat(session.id, 'same-day', hoursAgo(48));

    for (const pdf of [notesA, notesB, notesC]) {
      await materials.add(session.id, { dayId: session.day1, productId: pdf.id }, admin());
    }
    const overview = await materials.overview(session.id);
    const day1 = overview.days.find((d) => d.id === session.day1)!;
    expect(day1.materials.map((m) => m.productId)).toEqual([notesA.id, notesB.id, notesC.id]);
    for (const pdf of [notesA, notesB, notesC]) expect(await holds(holder.id, pdf.id)).toBe(true);

    await expect(
      materials.add(session.id, { dayId: session.day1, productId: notesB.id }, admin()),
    ).rejects.toThrow(/already on that day/);

    await materials.send(session.id);
    expect(sentMail).toHaveLength(1);
    for (const pdf of [notesA, notesB, notesC]) expect(sentMail[0].text).toContain(pdf.title);

    await materials.remove(session.id, day1.materials[1].id, admin());
    expect(await holds(holder.id, notesB.id)).toBe(false);
    expect(await holds(holder.id, notesA.id)).toBe(true);
    expect(await holds(holder.id, notesC.id)).toBe(true);
  });

  it('gives a bundle on a day with all its PDFs, follows its contents, and takes it all back on removal', async () => {
    const session = await createSession();
    const partA = await createPdf('bundle-a', false);
    const partB = await createPdf('bundle-b', false);
    const later = await createPdf('bundle-later', false);
    const bundle = await products.create(
      { title: `Bundle ${tag}`, type: ProductType.BUNDLE, accessType: AccessType.FREE, priceAmountMinor: '0' },
      admin(),
    );
    created.productIds.push(bundle.id);
    await prisma.productBundleItem.createMany({
      data: [
        { bundleProductId: bundle.id, childProductId: partA.id, sortOrder: 0 },
        { bundleProductId: bundle.id, childProductId: partB.id, sortOrder: 1 },
      ],
    });
    const holder = await seat(session.id, 'bundle-holder', hoursAgo(48));

    const overview = await materials.add(session.id, { dayId: session.day1, productId: bundle.id }, admin());
    for (const id of [bundle.id, partA.id, partB.id]) expect(await holds(holder.id, id)).toBe(true);
    const library = await entitlements.listForUser(holder.id);
    const card = library.find((e) => e.productId === bundle.id)!;
    expect(card.contents?.map((c) => c.id)).toEqual([partA.id, partB.id]);
    expect(library.some((e) => e.productId === partA.id)).toBe(false);

    // A PDF added to the bundle reaches seat holders on the next reconcile.
    await prisma.productBundleItem.create({ data: { bundleProductId: bundle.id, childProductId: later.id, sortOrder: 2 } });
    await materials.reconcile(session.id);
    expect(await holds(holder.id, later.id)).toBe(true);

    await materials.remove(session.id, overview.days[0].materials[0].id, admin());
    for (const id of [bundle.id, partA.id, partB.id, later.id]) expect(await holds(holder.id, id)).toBe(false);
  });

  it('emails each person once about what is new, and retries a failure', async () => {
    const session = await createSession();
    const notes1 = await createPdf('mail1');
    const notes2 = await createPdf('mail2');
    const a = await seat(session.id, 'mail-a', hoursAgo(48));
    const b = await seat(session.id, 'mail-b', hoursAgo(48));
    await materials.add(session.id, { dayId: session.day1, productId: notes1.id }, admin());

    failNext.add(b.email!);
    const first = await materials.send(session.id);
    expect(first.sent).toBe(1);
    expect(first.failed.map((f) => f.userId)).toEqual([b.id]);
    expect(sentMail[0].tag).toBe('session-materials');
    expect(sentMail[0].text).toContain(notes1.title);

    const afterFailure = (await materials.overview(session.id)).rows.find((r) => r.userId === b.id)!;
    expect(afterFailure.outstanding).toHaveLength(1);
    expect(afterFailure.lastError).toBe('error');

    sentMail.length = 0;
    const retry = await materials.send(session.id);
    expect(retry).toMatchObject({ sent: 1, nothingNew: 1 });
    expect(sentMail.map((m) => m.to.email)).toEqual([b.email]);

    // Only the new day's PDF goes in the next email.
    await materials.add(session.id, { dayId: session.day2, productId: notes2.id }, admin());
    sentMail.length = 0;
    await materials.send(session.id, { userIds: [a.id] });
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].text).toContain(notes2.title);
    expect(sentMail[0].text).not.toContain(notes1.title);
  });

  it('refuses a deleted day that has materials, and anything that is not a PDF with a file', async () => {
    const session = await createSession();
    const notes = await createPdf('guard');
    await materials.add(session.id, { dayId: session.day2, productId: notes.id }, admin());
    await expect(
      materials.add(session.id, { dayId: session.day2, productId: notes.id }, admin()),
    ).rejects.toThrow(/already on that day/);

    const view = await sessions.getForAdmin(session.id);
    await expect(
      sessions.update(
        session.id,
        { days: [{ id: view.days[0].id, startsAt: view.days[0].startsAt.toISOString(), durationMinutes: 120 }] },
        admin(),
      ),
    ).rejects.toThrow(/materials attached/);

    const empty = await products.create({ title: `No file ${tag}`, accessType: AccessType.FREE, priceAmountMinor: '0' }, admin());
    created.productIds.push(empty.id);
    await expect(materials.add(session.id, { dayId: session.day1, productId: empty.id }, admin())).rejects.toThrow(
      /no PDF uploaded/,
    );
    await expect(materials.add(session.id, { dayId: session.day1, productId: session.id }, admin())).rejects.toThrow(
      /Only PDFs/,
    );
  });
});

describe('show in store', () => {
  it('keeps a hidden PDF out of the store, unbuyable and unclaimable, but downloadable by its holders', async () => {
    const hidden = await createPdf('hidden', false);
    const visible = await createPdf('visible', true);
    const holder = await createUser('hidden-holder');
    const stranger = await createUser('stranger');
    await entitlements.grant({ userId: holder.id, productId: hidden.id, source: EntitlementSource.ADMIN_GRANT });

    const browse = await products.findPublic({ pageSize: 100, q: tag });
    expect(browse.items.map((p) => p.id)).toContain(visible.id);
    expect(browse.items.map((p) => p.id)).not.toContain(hidden.id);
    await expect(products.findPublicBySlug(hidden.slug)).rejects.toThrow(/not found/i);
    await expect(products.findPublicBySlug(visible.slug)).resolves.toBeDefined();

    await expect(
      orders.checkout({ userId: stranger.id, productId: hidden.id, customerEmail: stranger.email }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(download({ productId: hidden.id, userId: null })).rejects.toThrow(/not found/i);
    await expect(download({ productId: hidden.id, userId: holder.id })).resolves.toMatchObject({
      url: 'https://example.test/file.pdf',
    });
    // A free listed product still downloads without an account, as before.
    await expect(download({ productId: visible.id, userId: null })).resolves.toBeDefined();
  });
});
