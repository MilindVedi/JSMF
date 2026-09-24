import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssetKind, ProductAsset } from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf, type StorageVisibility } from '../../storage/domain/storage-provider.port';
import type { Actor } from './product.service';

export interface UploadAssetInput {
  productId: string;
  kind: AssetKind;
  content: Buffer;
  originalFilename: string;
  mimeType: string;
  pageCount?: number;
}

/**
 * What each asset kind is allowed to be, and where it lives.
 *
 * Only COVER_IMAGE is public. Everything else — including a sample preview —
 * is stored privately and reached through a signed URL, so that changing what a
 * preview is allowed to show later is a policy decision in the download
 * service rather than a file that has to be physically moved.
 */
const KIND_RULES: Record<AssetKind, { visibility: StorageVisibility; mimeTypes: RegExp }> = {
  [AssetKind.PRIMARY_FILE]: { visibility: 'PRIVATE', mimeTypes: /^application\/pdf$/ },
  [AssetKind.SAMPLE_PREVIEW]: { visibility: 'PRIVATE', mimeTypes: /^application\/pdf$/ },
  [AssetKind.ATTACHMENT]: {
    visibility: 'PRIVATE',
    mimeTypes: /^(application\/(pdf|zip)|image\/(png|jpeg|webp))$/,
  },
  [AssetKind.COVER_IMAGE]: { visibility: 'PUBLIC', mimeTypes: /^image\/(png|jpeg|webp)$/ },
};

@Injectable()
export class ProductAssetService {
  private readonly logger = new Logger(ProductAssetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Uploads a new version of an asset kind.
   *
   * There is no overwrite and no delete. A corrected re-upload becomes version
   * n+1 with the previous version retained, because the earlier file is what
   * people actually paid for and may still be referenced by a download that is
   * in flight. `product_assets_current_unique` — a partial unique index on
   * (product_id, kind) WHERE is_current — is what guarantees the question
   * "which file does a buyer get?" has exactly one answer.
   */
  async upload(input: UploadAssetInput, actor: Actor): Promise<ProductAsset> {
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    const rule = KIND_RULES[input.kind];

    if (!rule.mimeTypes.test(input.mimeType)) {
      throw new BadRequestException(
        `A ${input.kind} asset cannot be of type ${input.mimeType}.`,
      );
    }

    if (input.content.length === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }

    const current = await this.prisma.productAsset.findFirst({
      where: { productId: input.productId, kind: input.kind, isCurrent: true },
    });

    // The checksum column exists precisely to catch this: re-uploading a file
    // byte-identical to the current one is almost always a mistake (the wrong
    // file was corrected, or the same one was picked twice), and creating a
    // new version for it would make the version history meaningless.
    const checksum = await this.checksumOf(input.content);
    if (current?.checksumSha256 === checksum) {
      throw new ConflictException(
        'This file is identical to the current version, so no new version was created.',
      );
    }

    // Uploaded before the transaction opens: object storage is not
    // transactional, and holding a database transaction open across a network
    // upload would lock rows for the duration of a large PDF transfer.
    const stored = await this.storage.upload({
      content: input.content,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      visibility: rule.visibility,
      keyPrefix: `products/${input.productId}`,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Demote first: the partial unique index permits only one current row
        // per (product, kind), so inserting before demoting would collide.
        await tx.productAsset.updateMany({
          where: { productId: input.productId, kind: input.kind, isCurrent: true },
          data: { isCurrent: false },
        });

        const asset = await tx.productAsset.create({
          data: {
            productId: input.productId,
            kind: input.kind,
            storageProvider: stored.provider,
            bucket: stored.bucket,
            objectKey: stored.objectKey,
            originalFilename: stored.originalFilename.slice(0, 255),
            mimeType: stored.mimeType,
            sizeBytes: BigInt(stored.sizeBytes),
            checksumSha256: checksum,
            pageCount: input.pageCount,
            version: (current?.version ?? 0) + 1,
            isCurrent: true,
            uploadedById: actor.id,
          },
        });

        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'product.asset_uploaded',
            entityType: 'product_asset',
            entityId: asset.id,
            before: current ? { version: current.version, id: current.id } : null,
            after: {
              productId: asset.productId,
              kind: asset.kind,
              version: asset.version,
              sizeBytes: asset.sizeBytes,
              checksumSha256: asset.checksumSha256,
            },
            ip: actor.ip,
          },
          tx,
        );

        return asset;
      });
    } catch (error) {
      // The bytes are already in storage but no row points at them. Removing
      // the orphan keeps a failed upload from silently consuming quota
      // forever; if this cleanup itself fails there is nothing further to do
      // but say so loudly, since the alternative is masking the real error.
      await this.storage.delete(stored).catch((cleanupError: unknown) => {
        this.logger.error(
          `Orphaned object ${stored.bucket}/${stored.objectKey} could not be removed: ${String(cleanupError)}`,
        );
      });

      throw error;
    }
  }

  /** A time-limited link for an admin to check what was actually uploaded. */
  async getAdminSignedUrl(assetId: string): Promise<string> {
    const asset = await this.prisma.productAsset.findUnique({ where: { id: assetId } });

    if (!asset) throw new NotFoundException('Asset not found');

    return this.storage.getSignedDownloadUrl(objectRefOf(asset), {
      disposition: 'inline',
      downloadFilename: asset.originalFilename ?? undefined,
    });
  }

  /**
   * Makes an older version current again, for when a replacement turns out to
   * be the wrong file. Still not a delete: the version being stepped away from
   * stays in the table.
   */
  async makeCurrent(assetId: string, actor: Actor): Promise<ProductAsset> {
    const asset = await this.prisma.productAsset.findUnique({ where: { id: assetId } });

    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.isCurrent) return asset;

    return this.prisma.$transaction(async (tx) => {
      await tx.productAsset.updateMany({
        where: { productId: asset.productId, kind: asset.kind, isCurrent: true },
        data: { isCurrent: false },
      });

      const promoted = await tx.productAsset.update({
        where: { id: assetId },
        data: { isCurrent: true },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'product.asset_version_restored',
          entityType: 'product_asset',
          entityId: assetId,
          after: { productId: asset.productId, kind: asset.kind, version: asset.version },
          ip: actor.ip,
        },
        tx,
      );

      return promoted;
    });
  }

  private async checksumOf(content: Buffer): Promise<string> {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(content).digest('hex');
  }
}
