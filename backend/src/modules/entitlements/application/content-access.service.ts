import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessType, AssetKind, ContentAccessPurpose, ProductStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';
import { dispositionFor, isDownloadAllowed } from '../domain/content-access';
import { EntitlementService } from './entitlement.service';

const RENEWAL_LOG_WINDOW_MS = 60 * 60 * 1000;

export interface ContentAccessRequest {
  productId: string;
  /** Null for an anonymous visitor: free items, and samples. */
  userId: string | null;
  purpose: ContentAccessPurpose;
  /** Downloads only: another asset kind (an attachment). Reading is always the primary file. */
  kind?: AssetKind;
  /**
   * A reader asking for a fresh link because the last one expired mid-read.
   * Checked exactly like the first request — access revoked in the meantime
   * ends the session — but not logged again when it was logged within the
   * hour, so an hour of reading is one access event, not twelve.
   */
  renew?: boolean;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ContentAccessGrant {
  url: string;
  expiresAt: Date;
  /** The link's lifetime from now: what a client should time renewals by, whatever its clock says. */
  expiresInSeconds: number;
  filename: string | null;
  /** Which file version the link is for: a reader keys saved pages to it. */
  asset: { id: string; version: number; sizeBytes: number | null; pageCount: number | null };
  product: { id: string; title: string; slug: string };
  /** Whether the Download button should be offered alongside the reader. */
  downloadAllowed: boolean;
}

/**
 * The one path to a product's file — to download it, to read it in the
 * browser, or to read its sample. Every rule about who may have which bytes
 * lives here; the routes only say which purpose they serve.
 *
 * - DOWNLOAD and READ need what a download always needed: an entitlement, or
 *   a free product that is in the store. DOWNLOAD additionally needs downloads
 *   to be on for the product (DownloadPolicy).
 * - SAMPLE needs nothing but a product that is in the store and has a sample.
 *   The sample is its own file — never the full file with pages hidden — so
 *   giving it to anyone gives away only those pages.
 *
 * Free products are deliberately not short-circuited to a public URL: keeping
 * them on this path means "free" stays a pricing decision rather than a
 * storage decision, so a PDF can be made paid later without moving the file
 * or breaking a link that is already in a YouTube description.
 */
@Injectable()
export class ContentAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  async grant(request: ContentAccessRequest): Promise<ContentAccessGrant> {
    const product = await this.prisma.product.findFirst({
      where: { id: request.productId, deletedAt: null },
      select: {
        id: true,
        accessType: true,
        status: true,
        listed: true,
        title: true,
        slug: true,
        downloadPolicy: true,
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    const inStore = product.status === ProductStatus.PUBLISHED && product.listed;
    const entitlement = request.userId
      ? await this.entitlements.findActive(request.userId, product.id)
      : null;

    if (request.purpose === ContentAccessPurpose.SAMPLE) {
      // A sample is a shop-window feature: only for what the shop shows.
      if (!inStore) throw new NotFoundException('Product not found');
    } else if (!entitlement) {
      // An unpublished or archived product stays readable for someone who
      // already owns it — they paid for it, and withdrawing it from sale is not
      // the same as taking it away from buyers.
      if (product.accessType !== AccessType.FREE) {
        throw request.userId
          ? new ForbiddenException('You do not own this product.')
          : new UnauthorizedException('Sign in to open this product.');
      }

      // A free item without an account is a store feature; a product hidden
      // from the store is only for the people it was given to.
      if (!inStore) throw new NotFoundException('Product not found');
    }

    const downloadAllowed = isDownloadAllowed(product.downloadPolicy, await this.storeWideDownloads());

    const kind =
      request.purpose === ContentAccessPurpose.SAMPLE
        ? AssetKind.SAMPLE_PREVIEW
        : request.purpose === ContentAccessPurpose.READ
          ? AssetKind.PRIMARY_FILE
          : (request.kind ?? AssetKind.PRIMARY_FILE);

    // The switch is about the PDF itself — "read it here, don't take a copy".
    // Extras (a zip, images) cannot be opened in the reader, so turning
    // downloads off must not take them away.
    if (request.purpose === ContentAccessPurpose.DOWNLOAD && kind === AssetKind.PRIMARY_FILE && !downloadAllowed) {
      throw new ForbiddenException('Downloads are turned off for this item. You can read it here instead.');
    }

    const asset = await this.prisma.productAsset.findFirst({
      where: { productId: product.id, kind, isCurrent: true },
    });

    if (!asset) {
      throw new NotFoundException(
        request.purpose === ContentAccessPurpose.SAMPLE
          ? 'This item has no sample to read.'
          : 'This product has no file available.',
      );
    }

    const disposition = dispositionFor(request.purpose);
    const url = await this.storage.getSignedDownloadUrl(objectRefOf(asset), {
      disposition,
      downloadFilename:
        disposition === 'attachment' ? (asset.originalFilename ?? `${product.title}.pdf`) : undefined,
    });
    const ttlSeconds = Number(this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS')) || 300;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Logged on every first mint, not on every completed transfer — a signed
    // URL is handed out here and used outside our control, so this is the last
    // moment we can observe it. Collecting it from day one is the point: the
    // expensive part of an analytics feature later is the history that was
    // never recorded. A renewal is skipped only when this reader really was
    // logged for this file recently; `renew` is the client's word, and a first
    // open sent as a "renewal" would otherwise never be recorded.
    if (!request.renew || !(await this.loggedRecently(request, asset.id))) {
      await this.prisma.contentAccessEvent.create({
        data: {
          userId: request.userId,
          productId: product.id,
          assetId: asset.id,
          entitlementId: entitlement?.id ?? null,
          purpose: request.purpose,
          signedUrlExpiresAt: expiresAt,
          ip: request.ip ?? null,
          userAgent: request.userAgent ?? null,
        },
      });
    }

    return {
      url,
      expiresAt,
      expiresInSeconds: ttlSeconds,
      filename: asset.originalFilename,
      asset: {
        id: asset.id,
        version: asset.version,
        sizeBytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
        pageCount: asset.pageCount,
      },
      product: { id: product.id, title: product.title, slug: product.slug },
      downloadAllowed,
    };
  }

  /**
   * Whether this reader (the account, or the address for a visitor) was logged
   * opening this file for this purpose within the hour: one event per hour of
   * reading, however often the link is renewed.
   */
  private async loggedRecently(request: ContentAccessRequest, assetId: string): Promise<boolean> {
    if (!request.userId && !request.ip) return false;
    const event = await this.prisma.contentAccessEvent.findFirst({
      where: {
        productId: request.productId,
        assetId,
        purpose: request.purpose,
        createdAt: { gte: new Date(Date.now() - RENEWAL_LOG_WINDOW_MS) },
        ...(request.userId ? { userId: request.userId } : { userId: null, ip: request.ip }),
      },
      select: { id: true },
    });
    return event !== null;
  }

  /** Whether the store-wide switch lets buyers download (on until the apps ship). */
  async storeWideDownloads(): Promise<boolean> {
    const settings = await this.prisma.platformSettings.findUnique({
      where: { id: 'global' },
      select: { downloadsEnabled: true },
    });
    return settings?.downloadsEnabled ?? true;
  }
}
