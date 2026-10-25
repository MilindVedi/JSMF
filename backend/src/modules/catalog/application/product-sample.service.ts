import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AssetKind, ProductAsset } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFPageLeaf, type PDFContext } from 'pdf-lib';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';
import { KIND_RULES, ProductAssetService } from './product-asset.service';
import type { Actor } from './product.service';

const MB = 1024 * 1024;

/** What the admin screen shows about a product's sample. */
export interface SampleStatus {
  /** Null when there is no sample. */
  source: 'CUT' | 'UPLOADED' | null;
  /** Pages in the current sample. */
  pageCount: number | null;
  /** For a cut sample: false when the main file changed and re-cutting failed. */
  upToDate: boolean;
}

/**
 * A cut by hand ("Cut sample"), or one following the product's file after it
 * changed. A following cut that finds the ground moved under it — a newer
 * file, or the admin removed or re-cut the sample meanwhile — quietly stands
 * down: whatever moved it decides the sample now.
 */
type CutMode = 'BY_HAND' | 'FOLLOWING';

/**
 * The "Read sample" file. Either one an admin uploaded, or one cut here from
 * the first N pages of the product's file.
 *
 * Cut, not hidden: the reader is given this short file and nothing else, so a
 * visitor who has not bought the product holds only those pages. Showing the
 * full file with later pages hidden would put the whole book one "Save as"
 * away. The same holds inside the file: see withoutWayOut.
 *
 * A cut sample follows its file: when the product's file is replaced (or an
 * old cut sample restored), the sample is cut again from the current file
 * (ProductAssetService.onCurrentChanged).
 */
@Injectable()
export class ProductSampleService implements OnModuleInit {
  private readonly logger = new Logger(ProductSampleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: ProductAssetService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.assets.onCurrentChanged(async ({ productId, kind, actor }) => {
      if (kind !== AssetKind.PRIMARY_FILE && kind !== AssetKind.SAMPLE_PREVIEW) return;
      await this.recutIfStale(productId, actor);
    });
  }

  /**
   * Cuts the first `pageCount` pages of the current file into a new sample
   * version, and keeps cutting from that count when the file changes.
   */
  async cutFromFirstPages(productId: string, pageCount: number, actor: Actor): Promise<ProductAsset> {
    const asset = await this.cut(productId, pageCount, actor, 'BY_HAND');
    // Only a following cut stands down; a cut by hand either lands or throws.
    if (!asset) throw new ConflictException('The sample changed while it was being cut. Try again.');
    return asset;
  }

  /** No sample at all: the current one is retired (kept as a version) and cutting stops. */
  async remove(productId: string, actor: Actor): Promise<void> {
    await this.assets.productOrThrow(productId);
    await this.prisma.$transaction(async (tx) => {
      // After this, a re-cut still in flight sees no page count and stands down.
      await this.assets.lockFiles(tx, productId);
      const current = await tx.productAsset.findFirst({
        where: { productId, kind: AssetKind.SAMPLE_PREVIEW, isCurrent: true },
        select: { id: true, version: true },
      });
      await tx.productAsset.updateMany({
        where: { productId, kind: AssetKind.SAMPLE_PREVIEW, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.product.update({ where: { id: productId }, data: { samplePageCount: null } });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'product.sample_removed',
          entityType: 'product',
          entityId: productId,
          before: current,
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  async status(productId: string): Promise<SampleStatus> {
    await this.assets.productOrThrow(productId);
    const [product, sample, primary] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId }, select: { samplePageCount: true } }),
      this.assets.currentVersion(productId, AssetKind.SAMPLE_PREVIEW),
      this.assets.currentVersion(productId, AssetKind.PRIMARY_FILE),
    ]);
    if (!sample) return { source: null, pageCount: null, upToDate: true };
    const cut = sample.derivedFromAssetId !== null && product?.samplePageCount != null;
    return {
      source: cut ? 'CUT' : 'UPLOADED',
      pageCount: sample.pageCount,
      upToDate: !cut || sample.derivedFromAssetId === primary?.id,
    };
  }

  private async cut(productId: string, pageCount: number, actor: Actor, mode: CutMode): Promise<ProductAsset | null> {
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new BadRequestException('The sample must be at least one page.');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, slug: true, title: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const source = await this.assets.currentVersion(productId, AssetKind.PRIMARY_FILE);
    if (!source) throw new BadRequestException('Upload the product’s PDF first; the sample is cut from it.');

    const { content, total } = await this.cutPages(await this.readWhole(source), pageCount, product.title);

    const stored = await this.storage.upload({
      content,
      originalFilename: `${product.slug}-sample.pdf`,
      mimeType: 'application/pdf',
      visibility: KIND_RULES[AssetKind.SAMPLE_PREVIEW].visibility,
      keyPrefix: `products/${productId}`,
    });

    let asset: ProductAsset | null;
    try {
      asset = await this.prisma.$transaction(async (tx) => {
        // The cut took a while; check nothing moved before recording it.
        await this.assets.lockFiles(tx, productId);
        const [latestSource, latest] = [
          await tx.productAsset.findFirst({
            where: { productId, kind: AssetKind.PRIMARY_FILE, isCurrent: true },
            select: { id: true },
          }),
          await tx.product.findUnique({ where: { id: productId }, select: { samplePageCount: true } }),
        ];
        if (latestSource?.id !== source.id) {
          // A newer file arrived; its own re-cut follows it.
          if (mode === 'FOLLOWING') return null;
          throw new ConflictException('The PDF was replaced while the sample was being cut. Cut it again.');
        }
        // Removed, replaced by an upload, or re-cut by hand meanwhile.
        if (mode === 'FOLLOWING' && latest?.samplePageCount !== pageCount) return null;

        const recorded = await this.assets.recordVersion(
          tx,
          {
            productId,
            kind: AssetKind.SAMPLE_PREVIEW,
            ref: stored,
            originalFilename: stored.originalFilename,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            checksumSha256: createHash('sha256').update(content).digest('hex'),
            checksumMd5: stored.checksumMd5,
            pageCount,
            derivedFromAssetId: source.id,
          },
          actor,
        );
        await tx.product.update({ where: { id: productId }, data: { samplePageCount: pageCount } });
        // Learned on the way, and otherwise unknown for a direct upload.
        if (source.pageCount === null) {
          await tx.productAsset.update({ where: { id: source.id }, data: { pageCount: total } });
        }
        return recorded;
      });
    } catch (error) {
      await this.storage.delete(stored).catch(() => undefined);
      throw error;
    }
    if (!asset) await this.storage.delete(stored).catch(() => undefined);
    return asset;
  }

  /** The first `pageCount` pages as a new PDF. Any failure is the file's, so a 400. */
  private async cutPages(
    bytes: Buffer,
    pageCount: number,
    title: string,
  ): Promise<{ content: Buffer; total: number }> {
    const unreadable = 'This PDF could not be opened to cut a sample from. Upload a sample file instead.';
    let document: PDFDocument;
    try {
      document = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      throw new BadRequestException(unreadable);
    }
    // pdf-lib can load an encrypted file but not decrypt it: the cut pages
    // would be unreadable, so it is refused rather than half-done.
    if (document.isEncrypted) {
      throw new BadRequestException(
        'This PDF is password-protected, so a sample cannot be cut from it. Upload a sample file instead.',
      );
    }

    const total = document.getPageCount();
    if (pageCount >= total) {
      throw new BadRequestException(
        `The PDF has ${total} page${total === 1 ? '' : 's'}; a sample must be shorter than that, or it gives the whole file away.`,
      );
    }

    try {
      withoutWayOut(document, pageCount);
      const sample = await PDFDocument.create();
      const pages = await sample.copyPages(
        document,
        Array.from({ length: pageCount }, (_, index) => index),
      );
      for (const page of pages) sample.addPage(page);

      // The check that matters, whatever path a reference took: a page object
      // in the file that is not one of the sample's pages is a page given away.
      const pagesInFile = sample.context
        .enumerateIndirectObjects()
        .filter(([, object]) => object instanceof PDFPageLeaf).length;
      if (pagesInFile !== pageCount) {
        throw new BadRequestException(
          'This PDF links its first pages to later ones in a way that cannot be cut safely. Upload a sample file instead.',
        );
      }

      sample.setTitle(`${title} (sample)`);
      sample.setProducer('JSMF');
      return { content: Buffer.from(await sample.save({ useObjectStreams: true })), total };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(unreadable);
    }
  }

  /**
   * Re-cuts a cut sample that no longer matches the current file: after the
   * file is replaced, or an old cut sample is restored. A sample that is up to
   * date, uploaded, or absent is left alone.
   */
  private async recutIfStale(productId: string, actor: Actor): Promise<void> {
    const [product, sample, primary] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId }, select: { samplePageCount: true } }),
      this.assets.currentVersion(productId, AssetKind.SAMPLE_PREVIEW),
      this.assets.currentVersion(productId, AssetKind.PRIMARY_FILE),
    ]);
    if (!product?.samplePageCount || !primary) return;
    if (sample?.derivedFromAssetId === primary.id) return;

    try {
      await this.cut(productId, product.samplePageCount, actor, 'FOLLOWING');
    } catch (error) {
      // The new file may be shorter than the sample, or unreadable. The old
      // sample stays up, marked out of date on the admin screen.
      this.logger.warn(`Sample for product ${productId} not re-cut: ${String(error)}`);
      await this.audit.record({
        actorUserId: actor.id,
        action: 'product.sample_recut_failed',
        entityType: 'product',
        entityId: productId,
        after: { reason: error instanceof Error ? error.message : String(error) },
        ip: actor.ip,
      });
    }
  }

  /** The whole file, within what this server can safely hold to cut it. */
  private async readWhole(asset: ProductAsset): Promise<Buffer> {
    const size = asset.sizeBytes === null ? null : Number(asset.sizeBytes);
    const limitMb = Number(this.config.get('SAMPLE_CUT_MAX_MB')) || 50;
    if (size === null) throw new BadRequestException('The PDF’s size is unknown; re-upload it to cut a sample.');
    if (size > limitMb * MB) {
      throw new BadRequestException(
        `This PDF is over ${limitMb} MB, too large to cut a sample from here. Upload a sample file instead.`,
      );
    }
    return this.storage.readRange(objectRefOf(asset), 0, size - 1);
  }
}

/**
 * Cuts every thread from the first `pageCount` pages to the rest of the book,
 * in place on the loaded source (never saved).
 *
 * Copying a page copies everything it references, and a page can reference
 * other pages: a table-of-contents link (`/Dest [page …]`), a form field
 * (through its parent's other widgets), an article thread (`/B`), a page
 * action (`/AA`). Each would bring a later page's full content into the
 * sample, unseen in a reader but there for anyone who looks. So only links
 * that leave the PDF for a web address are kept. Links between pages go too,
 * even to a page inside the sample: pdf-lib copies a linked page a second
 * time, as an orphan, rather than pointing at the copy it already made.
 */
function withoutWayOut(document: PDFDocument, pageCount: number): void {
  const context = document.context;

  for (const page of document.getPages().slice(0, pageCount)) {
    page.node.delete(PDFName.of('B'));
    page.node.delete(PDFName.of('AA'));
    const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annotations) continue;
    const kept = annotations.asArray().filter((entry) => isWebLink(context.lookup(entry), context));
    if (kept.length === 0) page.node.delete(PDFName.of('Annots'));
    else page.node.set(PDFName.of('Annots'), context.obj(kept));
  }
}

function isWebLink(annotation: unknown, context: PDFContext): boolean {
  if (!(annotation instanceof PDFDict)) return false;
  if (annotation.get(PDFName.of('Subtype')) !== PDFName.of('Link')) return false;
  const action = context.lookupMaybe(annotation.get(PDFName.of('A')), PDFDict);
  return Boolean(action && action.get(PDFName.of('S')) === PDFName.of('URI') && !action.has(PDFName.of('Next')));
}
