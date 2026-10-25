import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AccessType,
  AssetKind,
  ContentAccessPurpose,
  DownloadPolicy,
  EntitlementSource,
  ProductStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFPageLeaf, PDFString } from 'pdf-lib';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ProductAssetService } from '../../catalog/application/product-asset.service';
import { ProductSampleService } from '../../catalog/application/product-sample.service';
import { ProductService } from '../../catalog/application/product.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';
import { LocalStorageAdapter } from '../../storage/infrastructure/local-storage.adapter';
import { ContentAccessService } from './content-access.service';
import { EntitlementService } from './entitlement.service';
import { ReadingProgressService } from './reading-progress.service';

/**
 * The reader against real Postgres (dev stack) and the local storage driver in
 * a temporary folder: who may open what for which purpose, the download
 * switch, samples cut from the first pages, and saved reading positions.
 *
 * The store-wide download switch is stubbed, never written: the setting is one
 * shared row, and other spec files (session materials) download in parallel.
 */
let root: string;
const env: Record<string, unknown> = {
  STORAGE_PRIVATE_BUCKET: 'private',
  STORAGE_PUBLIC_BUCKET: 'public',
  APP_PUBLIC_URL: 'http://localhost:4000/api',
  STORAGE_SIGNING_SECRET: 'test-signing-secret-at-least-16',
  STORAGE_SIGNED_URL_TTL_SECONDS: 300,
  MAX_DIRECT_UPLOAD_SIZE_MB: 5,
};
const config = {
  get: (key: string) => (key === 'STORAGE_LOCAL_ROOT' ? root : (env[key] ?? process.env[key])),
} as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const entitlements = new EntitlementService(prisma);
const reading = new ReadingProgressService(prisma, entitlements);
const products = new ProductService(prisma, audit);
let storage: StorageService;
let assets: ProductAssetService;
let samples: ProductSampleService;
let access: ContentAccessService;

const tag = randomUUID().slice(0, 8);
const created = { userIds: [] as string[], productIds: [] as string[] };
let admin: { id: string };
let owner: string;
let stranger: string;

/** A real PDF with `pages` pages, each saying which page it is. */
async function pdf(pages: number, label = 'Book'): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let n = 1; n <= pages; n++) {
    document.addPage([300, 400]).drawText(`${label} page ${n}`, { x: 40, y: 200, size: 18 });
  }
  return Buffer.from(await document.save());
}

async function product(input: { free?: boolean; listed?: boolean; pages?: number } = {}) {
  const row = await products.create(
    {
      title: `Reader spec ${tag} ${randomUUID().slice(0, 4)}`,
      accessType: input.free ? AccessType.FREE : AccessType.PAID,
      priceAmountMinor: input.free ? '0' : '19900',
      listed: input.listed ?? true,
    },
    admin,
  );
  created.productIds.push(row.id);
  await prisma.product.update({
    where: { id: row.id },
    data: { status: ProductStatus.PUBLISHED, publishedAt: new Date() },
  });
  if (input.pages) {
    await assets.upload(
      {
        productId: row.id,
        kind: AssetKind.PRIMARY_FILE,
        content: await pdf(input.pages),
        originalFilename: 'book.pdf',
        mimeType: 'application/pdf',
      },
      admin,
    );
  }
  return row;
}

const pagesIn = async (assetId: string) => {
  const asset = await prisma.productAsset.findUniqueOrThrow({ where: { id: assetId } });
  const bytes = await storage.readRange(objectRefOf(asset), 0, Number(asset.sizeBytes) - 1);
  return (await PDFDocument.load(bytes)).getPageCount();
};

const setStoreWide = (downloadsEnabled: boolean) =>
  vi.spyOn(access, 'storeWideDownloads').mockResolvedValue(downloadsEnabled);

/** Page objects anywhere in a stored PDF — in its page tree or not. */
const pageObjectsIn = async (assetId: string) => {
  const asset = await prisma.productAsset.findUniqueOrThrow({ where: { id: assetId } });
  const bytes = await storage.readRange(objectRefOf(asset), 0, Number(asset.sizeBytes) - 1);
  const document = await PDFDocument.load(bytes);
  return document.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFPageLeaf).length;
};

const upload = async (productId: string, kind: AssetKind, content: Buffer, originalFilename = 'file.pdf') =>
  assets.upload({ productId, kind, content, originalFilename, mimeType: 'application/pdf' }, admin);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'jsmf-reader-'));
  const local = new LocalStorageAdapter(config);
  storage = new StorageService(local, [local]);
  assets = new ProductAssetService(prisma, storage, audit);
  samples = new ProductSampleService(prisma, storage, assets, audit, config);
  samples.onModuleInit();
  access = new ContentAccessService(prisma, entitlements, storage, config);

  const user = async (label: string) => {
    const row = await prisma.user.create({
      data: { email: `reader-spec-${label}-${tag}@jsmf.test`, name: 'Reader Spec', status: UserStatus.ACTIVE },
    });
    created.userIds.push(row.id);
    return row.id;
  };
  admin = { id: await user('admin') };
  owner = await user('owner');
  stranger = await user('stranger');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  const productId = { in: created.productIds };
  await prisma.readingProgress.deleteMany({ where: { productId } });
  await prisma.contentAccessEvent.deleteMany({ where: { productId } });
  await prisma.entitlement.deleteMany({ where: { productId } });
  await prisma.productAsset.updateMany({ where: { productId }, data: { derivedFromAssetId: null } });
  await prisma.productAsset.deleteMany({ where: { productId } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: created.userIds } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe('opening a product in the reader', () => {
  it('gives an owner an in-place link to the current file, and logs one READ — renewing is checked, not logged', async () => {
    const book = await product({ pages: 3 });
    await entitlements.grant({ userId: owner, productId: book.id, source: EntitlementSource.ADMIN_GRANT });

    const grant = await access.grant({ productId: book.id, userId: owner, purpose: ContentAccessPurpose.READ });
    expect(grant.url).toContain('disposition=inline');
    expect(grant.asset).toMatchObject({ version: 1 });
    expect(grant.asset.sizeBytes).toBeGreaterThan(0);

    await access.grant({ productId: book.id, userId: owner, purpose: ContentAccessPurpose.READ, renew: true });
    const events = await prisma.contentAccessEvent.findMany({ where: { productId: book.id } });
    expect(events.map((e) => e.purpose)).toEqual([ContentAccessPurpose.READ]);

    // `renew` is the client's word: a first open sent as a renewal is still logged.
    const other = await product({ free: true, pages: 2 });
    await access.grant({ productId: other.id, userId: owner, purpose: ContentAccessPurpose.READ, renew: true });
    expect(await prisma.contentAccessEvent.count({ where: { productId: other.id } })).toBe(1);

    // The link really serves the bytes of that file.
    const asset = await prisma.productAsset.findUniqueOrThrow({ where: { id: grant.asset.id } });
    expect(asset.kind).toBe(AssetKind.PRIMARY_FILE);
  });

  it('refuses a paid product to someone without it, and asks a visitor to sign in', async () => {
    const book = await product({ pages: 2 });
    await expect(
      access.grant({ productId: book.id, userId: stranger, purpose: ContentAccessPurpose.READ }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      access.grant({ productId: book.id, userId: null, purpose: ContentAccessPurpose.READ }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('lets anyone read a free product that is in the store, but not one hidden from it', async () => {
    const free = await product({ free: true, pages: 2 });
    await expect(
      access.grant({ productId: free.id, userId: null, purpose: ContentAccessPurpose.READ }),
    ).resolves.toBeDefined();

    const hidden = await product({ free: true, listed: false, pages: 2 });
    await expect(
      access.grant({ productId: hidden.id, userId: null, purpose: ContentAccessPurpose.READ }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('the download switch', () => {
  it('turned off store-wide stops downloads, never reading; a product can override it either way', async () => {
    const book = await product({ free: true, pages: 2 });
    const open = (purpose: ContentAccessPurpose) => access.grant({ productId: book.id, userId: null, purpose });

    await setStoreWide(true);
    expect((await open(ContentAccessPurpose.READ)).downloadAllowed).toBe(true);
    await expect(open(ContentAccessPurpose.DOWNLOAD)).resolves.toBeDefined();

    await setStoreWide(false);
    await expect(open(ContentAccessPurpose.DOWNLOAD)).rejects.toMatchObject({ status: 403 });
    const read = await open(ContentAccessPurpose.READ);
    expect(read.downloadAllowed).toBe(false);

    await products.update(book.id, { downloadPolicy: DownloadPolicy.ALLOWED }, admin);
    await expect(open(ContentAccessPurpose.DOWNLOAD)).resolves.toBeDefined();

    await setStoreWide(true);
    await products.update(book.id, { downloadPolicy: DownloadPolicy.BLOCKED }, admin);
    await expect(open(ContentAccessPurpose.DOWNLOAD)).rejects.toMatchObject({ status: 403 });
    await expect(open(ContentAccessPurpose.READ)).resolves.toBeDefined();
  });

  it('covers the PDF only: extras the reader cannot open stay downloadable', async () => {
    const book = await product({ free: true, pages: 2 });
    await upload(book.id, AssetKind.ATTACHMENT, await pdf(1, 'Extra'), 'extra.pdf');
    await products.update(book.id, { downloadPolicy: DownloadPolicy.BLOCKED }, admin);
    const download = (kind: AssetKind) =>
      access.grant({ productId: book.id, userId: null, purpose: ContentAccessPurpose.DOWNLOAD, kind });

    await expect(download(AssetKind.PRIMARY_FILE)).rejects.toMatchObject({ status: 403 });
    await expect(download(AssetKind.ATTACHMENT)).resolves.toBeDefined();
  });
});

describe('samples', () => {
  it('cuts the first N pages into a separate file that anyone can read', async () => {
    const book = await product({ pages: 6 });
    await samples.cutFromFirstPages(book.id, 2, admin);

    const grant = await access.grant({ productId: book.id, userId: null, purpose: ContentAccessPurpose.SAMPLE });
    expect(await pagesIn(grant.asset.id)).toBe(2);
    const primary = await assets.currentVersion(book.id, AssetKind.PRIMARY_FILE);
    expect(grant.asset.id).not.toBe(primary!.id);
    // The cut also learned how long the file is.
    expect(primary!.pageCount).toBe(6);
    expect(await samples.status(book.id)).toEqual({ source: 'CUT', pageCount: 2, upToDate: true });
  });

  it('refuses a sample as long as the file, and has none to give until one exists', async () => {
    const book = await product({ pages: 3 });
    await expect(
      access.grant({ productId: book.id, userId: null, purpose: ContentAccessPurpose.SAMPLE }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(samples.cutFromFirstPages(book.id, 3, admin)).rejects.toThrow(/shorter/);
  });

  it('is cut again when the file is replaced, and an uploaded sample stops the cutting', async () => {
    const book = await product({ pages: 5 });
    await samples.cutFromFirstPages(book.id, 2, admin);
    const first = await assets.currentVersion(book.id, AssetKind.SAMPLE_PREVIEW);

    await assets.upload(
      {
        productId: book.id,
        kind: AssetKind.PRIMARY_FILE,
        content: await pdf(8, 'Second edition'),
        originalFilename: 'book-v2.pdf',
        mimeType: 'application/pdf',
      },
      admin,
    );
    const recut = await assets.currentVersion(book.id, AssetKind.SAMPLE_PREVIEW);
    const primary = await assets.currentVersion(book.id, AssetKind.PRIMARY_FILE);
    expect(recut!.id).not.toBe(first!.id);
    expect(recut!.derivedFromAssetId).toBe(primary!.id);
    expect(await pagesIn(recut!.id)).toBe(2);

    await assets.upload(
      {
        productId: book.id,
        kind: AssetKind.SAMPLE_PREVIEW,
        content: await pdf(1, 'Hand-made sample'),
        originalFilename: 'sample.pdf',
        mimeType: 'application/pdf',
      },
      admin,
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { id: book.id } })).samplePageCount).toBeNull();
    expect((await samples.status(book.id)).source).toBe('UPLOADED');
  });

  it('a new file too short for the sample leaves the old sample up, marked out of date', async () => {
    const book = await product({ pages: 6 });
    await samples.cutFromFirstPages(book.id, 4, admin);
    await assets.upload(
      {
        productId: book.id,
        kind: AssetKind.PRIMARY_FILE,
        content: await pdf(3, 'Shorter'),
        originalFilename: 'short.pdf',
        mimeType: 'application/pdf',
      },
      admin,
    );
    expect(await samples.status(book.id)).toEqual({ source: 'CUT', pageCount: 4, upToDate: false });
  });

  it('never carries a later page, even one a link on an early page points to', async () => {
    // A table of contents on page 1 linking to page 5 and to page 2.
    const source = await PDFDocument.create();
    for (let n = 1; n <= 6; n++) source.addPage([300, 400]).drawText(`Secret page ${n}`, { x: 40, y: 200, size: 18 });
    const [first, second, , , fifth] = source.getPages();
    const link = (target: typeof first) =>
      source.context.register(
        source.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], Dest: [target.ref, PDFName.of('Fit')] }),
      );
    first.node.set(PDFName.of('Annots'), source.context.obj([link(fifth), link(second)]));

    const book = await product();
    await upload(book.id, AssetKind.PRIMARY_FILE, Buffer.from(await source.save()));
    const sample = await samples.cutFromFirstPages(book.id, 2, admin);

    expect(await pagesIn(sample.id)).toBe(2);
    expect(await pageObjectsIn(sample.id)).toBe(2);

    // A link to the web is kept.
    const web = await PDFDocument.create();
    for (let n = 1; n <= 3; n++) web.addPage([300, 400]);
    const uri = web.context.obj({ S: 'URI', URI: PDFString.of('https://jsmf.me') });
    web
      .getPage(0)
      .node.set(
        PDFName.of('Annots'),
        web.context.obj([web.context.register(web.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], A: uri }))]),
      );
    const linked = await product();
    await upload(linked.id, AssetKind.PRIMARY_FILE, Buffer.from(await web.save()));
    const kept = await samples.cutFromFirstPages(linked.id, 1, admin);
    const keptAsset = await prisma.productAsset.findUniqueOrThrow({ where: { id: kept.id } });
    const keptDoc = await PDFDocument.load(await storage.readRange(objectRefOf(keptAsset), 0, Number(keptAsset.sizeBytes) - 1));
    expect(keptDoc.getPage(0).node.Annots()?.size()).toBe(1);
  });

  it('refuses an encrypted PDF, a too-large one, or a missing product, with a reason rather than a crash', async () => {
    const locked = await PDFDocument.create();
    for (let n = 1; n <= 3; n++) locked.addPage([300, 400]);
    locked.context.trailerInfo.Encrypt = locked.context.obj({ Filter: 'Standard' });
    const book = await product();
    await upload(book.id, AssetKind.PRIMARY_FILE, Buffer.from(await locked.save()));
    await expect(samples.cutFromFirstPages(book.id, 1, admin)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/password-protected/),
    });

    const big = await product({ pages: 3 });
    env.SAMPLE_CUT_MAX_MB = 0.000001;
    try {
      await expect(samples.cutFromFirstPages(big.id, 1, admin)).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/too large/),
      });
    } finally {
      delete env.SAMPLE_CUT_MAX_MB;
    }

    await expect(samples.status(randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(samples.remove(randomUUID(), admin)).rejects.toMatchObject({ status: 404 });
  });

  it('a cut by hand and a replaced file at once end with one sample, cut from the current file', async () => {
    const book = await product({ pages: 6 });
    await samples.cutFromFirstPages(book.id, 2, admin);

    const results = await Promise.allSettled([
      samples.cutFromFirstPages(book.id, 3, admin),
      upload(book.id, AssetKind.PRIMARY_FILE, await pdf(7, 'Second edition'), 'v2.pdf'),
    ]);
    // The upload always lands; the cut by hand lands or asks to be redone (409) — never a 500.
    expect(results[1].status).toBe('fulfilled');
    if (results[0].status === 'rejected') expect(results[0].reason).toMatchObject({ status: 409 });

    const current = await prisma.productAsset.findMany({
      where: { productId: book.id, kind: AssetKind.SAMPLE_PREVIEW, isCurrent: true },
    });
    expect(current).toHaveLength(1);
    expect(await samples.status(book.id)).toMatchObject({ source: 'CUT', upToDate: true });
  });

  it('restoring an old cut sample brings it up to the current file', async () => {
    const book = await product({ pages: 5 });
    const cut = await samples.cutFromFirstPages(book.id, 2, admin);
    await upload(book.id, AssetKind.PRIMARY_FILE, await pdf(6, 'Second edition'), 'v2.pdf');
    await upload(book.id, AssetKind.SAMPLE_PREVIEW, await pdf(1, 'Hand-made'), 'sample.pdf');

    await assets.makeCurrent(cut.id, admin);
    const primary = await assets.currentVersion(book.id, AssetKind.PRIMARY_FILE);
    const sample = await assets.currentVersion(book.id, AssetKind.SAMPLE_PREVIEW);
    expect(sample!.derivedFromAssetId).toBe(primary!.id);
    expect(await samples.status(book.id)).toEqual({ source: 'CUT', pageCount: 2, upToDate: true });
  });

  it('is not offered for a product hidden from the store, and can be removed', async () => {
    const hidden = await product({ listed: false, pages: 4 });
    await samples.cutFromFirstPages(hidden.id, 1, admin);
    await expect(
      access.grant({ productId: hidden.id, userId: null, purpose: ContentAccessPurpose.SAMPLE }),
    ).rejects.toMatchObject({ status: 404 });

    await samples.remove(hidden.id, admin);
    expect(await samples.status(hidden.id)).toEqual({ source: null, pageCount: null, upToDate: true });
  });
});

describe('reading position', () => {
  it('is saved for what the reader may read, and returned for the library', async () => {
    const book = await product({ pages: 4 });
    await entitlements.grant({ userId: owner, productId: book.id, source: EntitlementSource.ADMIN_GRANT });
    const assetId = (await assets.currentVersion(book.id, AssetKind.PRIMARY_FILE))!.id;

    await reading.save(owner, book.id, { page: 2, pageCount: 4, assetId });
    await reading.save(owner, book.id, { page: 3, pageCount: 4, assetId });
    expect(await reading.get(owner, book.id)).toMatchObject({ page: 3, pageCount: 4, assetId });
    expect((await reading.forProducts(owner, [book.id])).get(book.id)?.page).toBe(3);

    await expect(reading.save(stranger, book.id, { page: 1, pageCount: 4 })).rejects.toMatchObject({ status: 403 });
    await expect(reading.save(owner, book.id, { page: 5, pageCount: 4 })).rejects.toMatchObject({ status: 400 });
  });

  it('ignores a file id that is not this product’s book, but keeps the page', async () => {
    const free = await product({ free: true, pages: 3 });
    const saved = await reading.save(owner, free.id, { page: 1, pageCount: 3, assetId: randomUUID() });
    expect(saved).toMatchObject({ page: 1, assetId: null });

    const sample = await samples.cutFromFirstPages(free.id, 1, admin);
    expect(await reading.save(owner, free.id, { page: 1, pageCount: 3, assetId: sample.id })).toMatchObject({
      assetId: null,
    });
  });

  it('is refused for a product that was deleted, even to its owner', async () => {
    const book = await product({ pages: 2 });
    await entitlements.grant({ userId: owner, productId: book.id, source: EntitlementSource.ADMIN_GRANT });
    await prisma.product.update({ where: { id: book.id }, data: { deletedAt: new Date() } });
    await expect(reading.save(owner, book.id, { page: 1, pageCount: 2 })).rejects.toMatchObject({ status: 404 });
  });
});
