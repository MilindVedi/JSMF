import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StorageProvider, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ProductService } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OrderService } from '../../orders/application/order.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { LiveSessionService } from './live-session.service';
import { SessionTestimonialSectionsService } from './session-testimonial-sections.service';

/**
 * Named testimonial sections ("Day 1 feedback") beside a session's original
 * gallery, against a real Postgres. Storage is a fake that remembers what was
 * stored and deleted, so a URL is its object key.
 */

const config = {
  get(key: string) {
    if (key === 'STUB_PAYMENT_SECRET') return 'test-stub-secret-at-least-16-chars';
    return process.env[key];
  },
} as never;

const deleted: string[] = [];
let uploads = 0;
const storage = {
  upload: (input: { keyPrefix: string; mimeType: string }) =>
    Promise.resolve({
      provider: StorageProvider.LOCAL,
      bucket: 'public',
      objectKey: `${input.keyPrefix}/${++uploads}.png`,
      mimeType: input.mimeType,
      sizeBytes: 10,
    }),
  getSignedDownloadUrl: (ref: { objectKey: string }) => Promise.resolve(`https://cdn.test/${ref.objectKey}`),
  delete: (ref: { objectKey: string }) => {
    deleted.push(ref.objectKey);
    return Promise.resolve();
  },
} as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const entitlements = new EntitlementService(prisma);
const products = new ProductService(prisma, audit);
const orders = new OrderService(prisma, new StubPaymentAdapter(config), entitlements);
const sessions = new LiveSessionService(prisma, products, orders, entitlements, audit, storage, config);
const sections = new SessionTestimonialSectionsService(prisma, storage, audit);

const created = { userIds: [] as string[], productIds: [] as string[] };
const HOUR = 3600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const image = { buffer: Buffer.from('png'), originalname: 'x.png', mimetype: 'image/png' };
let adminId: string;
const admin = () => ({ id: adminId });

async function createSession() {
  const session = await sessions.create(
    {
      title: `Sections spec ${randomUUID().slice(0, 6)}`,
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
  return sessions.getForAdmin(session.id);
}

const publicView = async (sessionId: string) =>
  sessions.publicBySlug((await sessions.getForAdmin(sessionId)).slug);

beforeAll(async () => {
  await prisma.$connect();
  const user = await prisma.user.create({
    data: { email: `sections-admin-${randomUUID()}@jsmf.test`, name: 'Admin', status: UserStatus.ACTIVE },
  });
  adminId = user.id;
  created.userIds.push(user.id);
});

afterAll(async () => {
  const productIds = created.productIds;
  await prisma.sessionTestimonial.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.sessionTestimonialSection.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSessionDay.deleteMany({ where: { liveSessionId: { in: productIds } } });
  await prisma.liveSession.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: created.userIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
});

describe('testimonial sections', () => {
  it('shows a Day 1 section beside the original gallery, which is unchanged', async () => {
    const session = await createSession();
    await sessions.addTestimonial(session.id, image, admin());
    const day1 = await sections.create(
      session.id,
      { heading: 'What students said after Day 1', tag: 'Day 1 · live', dayId: session.days[0].id },
      admin(),
    );
    await sessions.addTestimonial(session.id, image, admin(), day1.id);
    await sessions.addTestimonial(session.id, image, admin(), day1.id);

    const view = await publicView(session.id);
    // The original gallery holds only its own image, as before.
    expect(view.testimonialUrls).toHaveLength(1);
    expect(view.testimonialUrls[0]).toContain('/testimonials/');
    expect(view.testimonialSections).toEqual([
      expect.objectContaining({
        id: day1.id,
        heading: 'What students said after Day 1',
        tag: 'Day 1 · live',
        dayNumber: 1,
        urls: [expect.any(String), expect.any(String)],
      }),
    ]);

    const adminView = await sessions.getForAdmin(session.id);
    expect(adminView.testimonials).toHaveLength(1);
    expect(adminView.testimonialSections[0].testimonials).toHaveLength(2);
  });

  it('keeps a hidden or empty section off the website, but in admin', async () => {
    const session = await createSession();
    const empty = await sections.create(session.id, { heading: 'Empty for now' }, admin());
    const hidden = await sections.create(session.id, { heading: 'Not yet', isVisible: false }, admin());
    await sessions.addTestimonial(session.id, image, admin(), hidden.id);

    expect((await publicView(session.id)).testimonialSections).toEqual([]);
    expect((await sessions.getForAdmin(session.id)).testimonialSections.map((s) => s.id)).toEqual([empty.id, hidden.id]);

    await sections.update(session.id, hidden.id, { isVisible: true }, admin());
    expect((await publicView(session.id)).testimonialSections.map((s) => s.id)).toEqual([hidden.id]);
  });

  it('orders images within one gallery at a time, and sections among themselves', async () => {
    const session = await createSession();
    const legacy = await sessions.addTestimonial(session.id, image, admin());
    const a = await sections.create(session.id, { heading: 'A' }, admin());
    const b = await sections.create(session.id, { heading: 'B' }, admin());
    const first = await sessions.addTestimonial(session.id, image, admin(), a.id);
    const second = await sessions.addTestimonial(session.id, image, admin(), a.id);

    // The original gallery's reorder names only its own images, as the admin screen sends today.
    await expect(sessions.reorderTestimonials(session.id, [legacy.id])).resolves.toBeUndefined();
    await expect(sessions.reorderTestimonials(session.id, [legacy.id, first.id])).rejects.toThrow(/exactly/);

    await sessions.reorderTestimonials(session.id, [second.id, first.id], a.id);
    const inA = (await sessions.getForAdmin(session.id)).testimonialSections.find((s) => s.id === a.id)!;
    expect(inA.testimonials.map((t) => t.id)).toEqual([second.id, first.id]);

    await sections.reorder(session.id, [b.id, a.id]);
    expect((await sessions.getForAdmin(session.id)).testimonialSections.map((s) => s.id)).toEqual([b.id, a.id]);
    await expect(sections.reorder(session.id, [a.id])).rejects.toThrow(/exactly/);
  });

  it('deletes a section with its images and stored files; the original gallery is untouched', async () => {
    const session = await createSession();
    const legacy = await sessions.addTestimonial(session.id, image, admin());
    const section = await sections.create(session.id, { heading: 'Gone soon' }, admin());
    await sessions.addTestimonial(session.id, image, admin(), section.id);
    const before = deleted.length;

    await sections.remove(session.id, section.id, admin());

    expect(deleted.length).toBe(before + 1);
    const adminView = await sessions.getForAdmin(session.id);
    expect(adminView.testimonialSections).toEqual([]);
    expect(adminView.testimonials.map((t) => t.id)).toEqual([legacy.id]);
  });

  it('survives its day being removed, and refuses days and sections from another session', async () => {
    const session = await createSession();
    const other = await createSession();
    const section = await sections.create(session.id, { heading: 'Day 2', dayId: session.days[1].id }, admin());
    await sessions.addTestimonial(session.id, image, admin(), section.id);

    // Dropping day 2 from the dates keeps the section, now tied to no day.
    await sessions.update(
      session.id,
      { days: [{ id: session.days[0].id, startsAt: inHours(48), durationMinutes: 120 }] },
      admin(),
    );
    expect((await publicView(session.id)).testimonialSections[0].dayNumber).toBeNull();

    await expect(sections.create(session.id, { heading: 'x', dayId: other.days[0].id }, admin())).rejects.toThrow(
      /not part of this session/,
    );
    await expect(sessions.addTestimonial(other.id, image, admin(), section.id)).rejects.toThrow(/not on this session/);
    await expect(sections.create(session.id, { heading: '  ' }, admin())).rejects.toThrow(/heading/);
  });
});
