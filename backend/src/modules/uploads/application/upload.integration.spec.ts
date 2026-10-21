import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessType, AssetKind, UploadStatus, UserStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { ProductAssetService } from '../../catalog/application/product-asset.service';
import { ProductUploadPurposes } from '../../catalog/application/product-upload-purposes';
import { ProductService } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { LiveSessionService } from '../../events/application/live-session.service';
import { SessionTestimonialUploads } from '../../events/application/session-testimonial-uploads';
import { OrderService } from '../../orders/application/order.service';
import { StubPaymentAdapter } from '../../payments/infrastructure/stub-payment.adapter';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';
import { LocalStorageAdapter } from '../../storage/infrastructure/local-storage.adapter';
import { UploadPurposeRegistry, type UploadActor } from './upload-purpose';
import { UploadService } from './upload.service';

/**
 * Direct uploads end to end against a real Postgres and the real local-disk
 * driver, which speaks GCS's resumable protocol: start, send the bytes in
 * pieces to the session URL exactly as a browser would, complete. Only the
 * HTTP hop to the session URL is skipped (receiveUpload is what the route calls).
 * The purposes are the real ones the app registers.
 */

let root: string;
const env: Record<string, unknown> = {
  STORAGE_PRIVATE_BUCKET: 'private',
  STORAGE_PUBLIC_BUCKET: 'public',
  APP_PUBLIC_URL: 'http://localhost:4000/api',
  STORAGE_SIGNING_SECRET: 'test-signing-secret-at-least-16',
  STORAGE_SIGNED_URL_TTL_SECONDS: 300,
  STUB_PAYMENT_SECRET: 'test-stub-secret-at-least-16-chars',
  MAX_UPLOAD_SIZE_MB: 25,
  MAX_DIRECT_UPLOAD_SIZE_MB: 5,
  MAX_IMAGE_UPLOAD_SIZE_MB: 1,
  DIRECT_UPLOAD_CHUNK_MB: 1,
  DIRECT_UPLOAD_EXPIRY_HOURS: 24,
  CORS_ORIGINS: ['http://localhost:3001'],
  STOREFRONT_URL: 'http://localhost:3001',
};
const config = {
  get: (key: string) => (key === 'STORAGE_LOCAL_ROOT' ? root : (env[key] ?? process.env[key])),
} as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const registry = new UploadPurposeRegistry();
let local: LocalStorageAdapter;
let uploads: UploadService;
let assets: ProductAssetService;
let products: ProductService;
let sessions: LiveSessionService;

const MB = 1024 * 1024;
const tag = randomUUID().slice(0, 8);
const created = { userIds: [] as string[], productIds: [] as string[] };
let admin: UploadActor;
let other: UploadActor;
let student: UploadActor;

const pdfBytes = (size: number) => {
  const head = Buffer.from(`%PDF-1.7\n% ${randomUUID()}\n`);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x20)]);
};
const pngBytes = (size: number) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(randomUUID()), Buffer.alloc(size)]);

async function* asBody(piece: Buffer) {
  yield piece;
}

const grantOf = (url: string) => local.verifyUploadToken(url.split('/').pop()!)!;

/** Sends `content` to the session URL in pieces, as the browser does. */
async function send(uploadUrl: string, content: Buffer, pieceSize = MB) {
  const grant = grantOf(uploadUrl);
  let result;
  for (let start = 0; start < content.length; start += pieceSize) {
    const piece = content.subarray(start, start + pieceSize);
    result = await local.receiveUpload(grant, `bytes ${start}-${start + piece.length - 1}/${content.length}`, asBody(piece));
  }
  return result;
}

async function createProduct() {
  const product = await products.create(
    { title: `Upload spec ${tag} ${randomUUID().slice(0, 4)}`, accessType: AccessType.FREE, priceAmountMinor: '0' },
    admin,
  );
  created.productIds.push(product.id);
  return product;
}

const start = (
  purpose: string,
  targetId: string | null,
  content: Buffer,
  overrides: Record<string, unknown> = {},
  actor: UploadActor = admin,
) =>
  uploads.start(
    {
      purpose,
      targetId,
      context: undefined,
      filename: purpose.includes('primary') ? 'notes.pdf' : 'shot.png',
      mimeType: purpose.includes('primary') ? 'application/pdf' : 'image/png',
      sizeBytes: content.length,
      origin: 'http://localhost:3001',
      ...overrides,
    },
    actor,
  );

const row = (id: string) => prisma.upload.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'jsmf-uploads-'));
  local = new LocalStorageAdapter(config);
  const storage = new StorageService(local, [local]);
  assets = new ProductAssetService(prisma, storage, audit);
  products = new ProductService(prisma, audit);
  const entitlements = new EntitlementService(prisma);
  sessions = new LiveSessionService(
    prisma,
    products,
    new OrderService(prisma, new StubPaymentAdapter(config), entitlements),
    entitlements,
    audit,
    storage,
    config,
  );
  new ProductUploadPurposes(registry, prisma, assets, config).onModuleInit();
  new SessionTestimonialUploads(registry, prisma, storage, config).onModuleInit();
  uploads = new UploadService(prisma, storage, registry, audit, config, new SweepRegistry());

  for (const label of ['admin', 'other', 'student']) {
    const user = await prisma.user.create({
      data: { email: `uploads-${label}-${tag}@jsmf.test`, name: label, status: UserStatus.ACTIVE },
    });
    created.userIds.push(user.id);
    const actor = { id: user.id, roles: label === 'student' ? ['STUDENT'] : ['ADMIN'] };
    if (label === 'admin') admin = actor;
    else if (label === 'other') other = actor;
    else student = actor;
  }
});

afterAll(async () => {
  await prisma.upload.deleteMany({ where: { createdById: { in: created.userIds } } });
  await prisma.sessionTestimonial.deleteMany({ where: { liveSessionId: { in: created.productIds } } });
  await prisma.sessionTestimonialSection.deleteMany({ where: { liveSessionId: { in: created.productIds } } });
  await prisma.liveSessionDay.deleteMany({ where: { liveSessionId: { in: created.productIds } } });
  await prisma.liveSession.deleteMany({ where: { productId: { in: created.productIds } } });
  await prisma.productAsset.deleteMany({ where: { productId: { in: created.productIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: created.userIds } } });
  await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe('direct uploads: product files', () => {
  it('records a PDF sent in pieces as the current version, and completing twice returns the same version', async () => {
    const product = await createProduct();
    const content = pdfBytes(2.5 * MB);

    const session = await start('product.primary_file', product.id, content, { context: { pageCount: 12 } });
    expect(session).toMatchObject({ sizeBytes: content.length, chunkSizeBytes: MB });
    expect(session.uploadUrl).toMatch(/^http:\/\/localhost:4000\/api\/storage\/local\/uploads\//);

    // Not there yet: refused, and left PENDING to complete later.
    await expect(uploads.complete(session.uploadId, admin)).rejects.toThrow(/not finished uploading/);

    expect(await send(session.uploadUrl, content)).toMatchObject({ status: 200 });
    const asset = (await uploads.complete(session.uploadId, admin)) as Record<string, unknown>;
    expect(asset).toMatchObject({
      productId: product.id,
      kind: AssetKind.PRIMARY_FILE,
      version: 1,
      isCurrent: true,
      bucket: 'private',
      sizeBytes: BigInt(content.length),
      checksumSha256: null,
      checksumMd5: createHash('md5').update(content).digest('hex'),
      pageCount: 12,
      originalFilename: 'notes.pdf',
    });
    expect(await row(session.uploadId)).toMatchObject({
      status: UploadStatus.COMPLETED,
      resultId: asset.id,
      purpose: 'product.primary_file',
      targetId: product.id,
      staged: false,
    });

    const again = (await uploads.complete(session.uploadId, admin)) as { id: string };
    expect(again.id).toBe(asset.id);
  });

  it('resumes: an overlapping piece after a dropped connection is stored once', async () => {
    const product = await createProduct();
    const content = pdfBytes(3 * MB);
    const session = await start('product.primary_file', product.id, content);
    const grant = grantOf(session.uploadUrl);

    await local.receiveUpload(grant, `bytes 0-${MB - 1}/${content.length}`, asBody(content.subarray(0, MB)));
    expect(await local.receiveUpload(grant, `bytes */${content.length}`, asBody(Buffer.alloc(0)))).toEqual({
      status: 308,
      storedBytes: MB,
    });
    await local.receiveUpload(grant, `bytes ${MB / 2}-${2 * MB - 1}/${content.length}`, asBody(content.subarray(MB / 2, 2 * MB)));
    expect(
      await local.receiveUpload(grant, `bytes ${2 * MB}-${content.length - 1}/${content.length}`, asBody(content.subarray(2 * MB))),
    ).toMatchObject({ status: 200 });

    const asset = (await uploads.complete(session.uploadId, admin)) as { checksumMd5: string };
    expect(asset.checksumMd5).toBe(createHash('md5').update(content).digest('hex'));
  });

  it('holds the session to the declared size, and never overwrites a stored object', async () => {
    const product = await createProduct();
    const content = pdfBytes(1000);
    const session = await start('product.primary_file', product.id, content);
    const grant = grantOf(session.uploadUrl);

    expect(await local.receiveUpload(grant, 'bytes 0-1000/1001', asBody(Buffer.concat([content, Buffer.from('x')])))).toMatchObject({
      status: 400,
    });
    expect(await send(session.uploadUrl, content)).toMatchObject({ status: 200 });
    expect(await local.receiveUpload(grant, 'bytes 0-999/1000', asBody(content))).toMatchObject({ status: 412 });
    expect(local.verifyUploadToken(`${session.uploadUrl.split('/').pop()!}x`)).toBeNull();
  });

  it('refuses a file that is not what it claims, and a byte-identical re-upload, removing each', async () => {
    const product = await createProduct();
    const png = pngBytes(500);
    const fake = await start('product.primary_file', product.id, png, { mimeType: 'application/pdf' });
    await send(fake.uploadUrl, png);
    await expect(uploads.complete(fake.uploadId, admin)).rejects.toThrow(/not a PDF/);
    const refused = await row(fake.uploadId);
    expect(refused.status).toBe(UploadStatus.ABORTED);
    expect(await local.exists(objectRefOf(refused))).toBe(false);
    await expect(uploads.complete(fake.uploadId, admin)).rejects.toThrow(/not a PDF/);

    // The current version came in the multipart way, which records MD5 too.
    const content = pdfBytes(4000);
    const first = await assets.upload(
      { productId: product.id, kind: AssetKind.PRIMARY_FILE, content, originalFilename: 'a.pdf', mimeType: 'application/pdf' },
      admin,
    );
    const same = await start('product.primary_file', product.id, content);
    await send(same.uploadUrl, content);
    await expect(uploads.complete(same.uploadId, admin)).rejects.toThrow(/identical to the current version/);
    expect((await row(same.uploadId)).status).toBe(UploadStatus.ABORTED);

    const next = pdfBytes(4000);
    const second = await start('product.primary_file', product.id, next);
    await send(second.uploadUrl, next);
    expect(((await uploads.complete(second.uploadId, admin)) as { version: number }).version).toBe(2);
    expect((await prisma.productAsset.findUniqueOrThrow({ where: { id: first.id } })).isCurrent).toBe(false);
  });

  it('checks a cover in private staging, then publishes it and removes the staged copy', async () => {
    const product = await createProduct();
    const cover = pngBytes(20_000);
    const session = await start('product.cover_image', product.id, cover);
    const staged = await row(session.uploadId);
    expect(staged).toMatchObject({ bucket: 'private', staged: true });
    expect(staged.objectKey).toMatch(/^staging\/product\.cover_image\//);

    await send(session.uploadUrl, cover);
    const asset = (await uploads.complete(session.uploadId, admin)) as { bucket: string; objectKey: string; kind: string };
    expect(asset).toMatchObject({ bucket: 'public', kind: AssetKind.COVER_IMAGE });
    expect(asset.objectKey).toMatch(new RegExp(`^products/${product.id}/`));
    expect(await local.exists({ provider: 'LOCAL', bucket: 'public', objectKey: asset.objectKey })).toBe(true);
    expect(await local.exists(objectRefOf(staged))).toBe(false);
  });

  it('refuses a public image that fails its checks while it is still private', async () => {
    const product = await createProduct();
    const notPng = pdfBytes(2000);
    const session = await start('product.cover_image', product.id, notPng);
    await send(session.uploadUrl, notPng);
    await expect(uploads.complete(session.uploadId, admin)).rejects.toThrow(/not really image\/png/);
    expect(await local.exists(objectRefOf(await row(session.uploadId)))).toBe(false);
    expect(await prisma.productAsset.count({ where: { productId: product.id } })).toBe(0);
  });
});

describe('direct uploads: session screenshots', () => {
  it('adds a screenshot to a named section, published from staging', async () => {
    const created_ = await sessions.create(
      {
        title: `Upload spec session ${tag}`,
        tagline: 'A test session',
        days: [{ startsAt: new Date(Date.now() + 48 * 3600_000).toISOString(), durationMinutes: 60 }],
        platformLabel: 'Live on Zoom',
        priceAmountMinor: '9900',
        highlights: ['One'],
      },
      admin,
    );
    created.productIds.push(created_.id);
    const section = await prisma.sessionTestimonialSection.create({
      data: { liveSessionId: created_.id, heading: 'Day 1' },
    });

    await expect(
      start('session.testimonial', created_.id, pngBytes(100), { context: { sectionId: randomUUID() } }),
    ).rejects.toThrow(/not on this session/);

    const shot = pngBytes(5000);
    const session = await start('session.testimonial', created_.id, shot, { context: { sectionId: section.id } });
    await send(session.uploadUrl, shot);
    const result = (await uploads.complete(session.uploadId, admin)) as { id: string; sortOrder: number; url: string };
    expect(result.sortOrder).toBe(0);
    const testimonial = await prisma.sessionTestimonial.findUniqueOrThrow({ where: { id: result.id } });
    expect(testimonial).toMatchObject({ sectionId: section.id, bucket: 'public', liveSessionId: created_.id });
    expect(testimonial.objectKey).toMatch(new RegExp(`^sessions/${created_.id}/testimonials/`));
  });
});

describe('direct uploads: rules and cleanup', () => {
  it('checks the request before any byte moves', async () => {
    const product = await createProduct();
    const content = pdfBytes(100);
    await expect(start('product.nonsense', product.id, content)).rejects.toThrow(/not a kind of upload/);
    await expect(start('product.primary_file', product.id, content, { mimeType: 'text/html' })).rejects.toThrow(/must be one of/);
    await expect(start('product.primary_file', product.id, content, { sizeBytes: 6 * MB })).rejects.toThrow(/the limit is 5 MB/);
    await expect(start('product.cover_image', product.id, pngBytes(2 * MB))).rejects.toThrow(/the limit is 1 MB/);
    await expect(start('product.primary_file', null, content)).rejects.toThrow(/which product/);
    await expect(start('product.primary_file', randomUUID(), content)).rejects.toThrow(/Product not found/);
    await expect(start('product.primary_file', product.id, content, { context: { pageCount: 0 } })).rejects.toThrow(/pageCount/);
    // A student may not upload product files at all.
    await expect(start('product.primary_file', product.id, content, {}, student)).rejects.toThrow(/cannot upload this kind/);

    // Only the person who started it can finish or cancel it.
    const session = await start('product.primary_file', product.id, content);
    await expect(uploads.complete(session.uploadId, other)).rejects.toThrow(/someone else/);
    await expect(uploads.abort(session.uploadId, other)).rejects.toThrow(/someone else/);
  });

  it('cancels, expires, and sweeps up what a session finished after being given up', async () => {
    const product = await createProduct();

    // Cancelled half-way, then the browser finished it anyway: the sweep removes it.
    const content = pdfBytes(3000);
    const cancelled = await start('product.primary_file', product.id, content);
    const grant = grantOf(cancelled.uploadUrl);
    await local.receiveUpload(grant, 'bytes 0-999/3000', asBody(content.subarray(0, 1000)));
    await uploads.abort(cancelled.uploadId, admin);
    expect((await row(cancelled.uploadId)).status).toBe(UploadStatus.ABORTED);
    await local.receiveUpload(grant, 'bytes 1000-2999/3000', asBody(content.subarray(1000)));
    const late = objectRefOf(await row(cancelled.uploadId));
    expect(await local.exists(late)).toBe(true);

    // Sent in full, but never completed before its expiry.
    const staleBytes = pdfBytes(2000);
    const stale = await start('product.primary_file', product.id, staleBytes);
    await send(stale.uploadUrl, staleBytes);
    await prisma.upload.update({ where: { id: stale.uploadId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    // A completed one is never touched.
    const keptBytes = pdfBytes(2000);
    const done = await start('product.primary_file', product.id, keptBytes);
    await send(done.uploadUrl, keptBytes);
    const asset = (await uploads.complete(done.uploadId, admin)) as { bucket: string; objectKey: string };

    const result = await uploads.sweep();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(await local.exists(late)).toBe(false);
    const staleRow = await row(stale.uploadId);
    expect(staleRow.status).toBe(UploadStatus.EXPIRED);
    expect(await local.exists(objectRefOf(staleRow))).toBe(false);
    await expect(uploads.complete(stale.uploadId, admin)).rejects.toThrow(/not finished in time|cancelled or expired/);
    expect(await local.exists({ provider: 'LOCAL', bucket: asset.bucket, objectKey: asset.objectKey })).toBe(true);
  });

  it('tells each person only the kinds of upload they may start', () => {
    const forAdmin = uploads.options(admin);
    expect(forAdmin).toMatchObject({ direct: true, chunkSizeBytes: MB, maxMultipartBytes: 25 * MB });
    expect(Object.keys(forAdmin.purposes).sort()).toEqual([
      'product.attachment',
      'product.cover_image',
      'product.primary_file',
      'product.sample_preview',
      'session.testimonial',
    ]);
    expect(forAdmin.purposes['product.primary_file']).toEqual({ maxBytes: 5 * MB, mimeTypes: ['application/pdf'] });
    expect(forAdmin.purposes['product.cover_image'].maxBytes).toBe(MB);
    expect(uploads.options(student).purposes).toEqual({});
  });
});
