import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessType, AssetKind, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';
import { EntitlementService } from './entitlement.service';

export interface DownloadRequest {
  productId: string;
  /** Null for an anonymous visitor taking a free download. */
  userId: string | null;
  kind?: AssetKind;
  ip?: string | null;
  userAgent?: string | null;
}

export interface DownloadGrant {
  url: string;
  expiresAt: Date;
  filename: string | null;
}

@Injectable()
export class DownloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The one path to a file, taken by free and paid content alike.
   *
   * Free products are deliberately not short-circuited to a public URL: keeping
   * them on this path means "free" stays a pricing decision rather than a
   * storage decision, so a PDF can be made paid later without moving the file
   * or breaking a link that is already in a YouTube description.
   */
  async authorize(request: DownloadRequest): Promise<DownloadGrant> {
    const product = await this.prisma.product.findFirst({
      where: { id: request.productId, deletedAt: null },
      select: { id: true, accessType: true, status: true, title: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    // An unpublished or archived product stays downloadable for someone who
    // already owns it — they paid for it, and withdrawing it from sale is not
    // the same as taking it away from buyers.
    const entitlement = request.userId
      ? await this.entitlements.findActive(request.userId, product.id)
      : null;

    if (!entitlement) {
      if (product.accessType !== AccessType.FREE) {
        throw request.userId
          ? new ForbiddenException('You do not own this product.')
          : new UnauthorizedException('Sign in to download this product.');
      }

      if (product.status !== ProductStatus.PUBLISHED) {
        throw new NotFoundException('Product not found');
      }
    }

    const kind = request.kind ?? AssetKind.PRIMARY_FILE;

    const asset = await this.prisma.productAsset.findFirst({
      where: { productId: product.id, kind, isCurrent: true },
    });

    if (!asset) {
      throw new NotFoundException('This product has no file available to download.');
    }

    const url = await this.storage.getSignedDownloadUrl(objectRefOf(asset), {
      disposition: 'attachment',
      downloadFilename: asset.originalFilename ?? `${product.title}.pdf`,
    });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Logged on every mint, not on every completed transfer — a signed URL is
    // handed out here and used outside our control, so this is the last moment
    // we can observe it. Collecting it from day one is the point: the expensive
    // part of a download-analytics feature later is the history that was never
    // recorded.
    await this.prisma.contentAccessEvent.create({
      data: {
        userId: request.userId,
        productId: product.id,
        assetId: asset.id,
        entitlementId: entitlement?.id ?? null,
        signedUrlExpiresAt: expiresAt,
        ip: request.ip ?? null,
        userAgent: request.userAgent ?? null,
      },
    });

    return { url, expiresAt, filename: asset.originalFilename };
  }
}
