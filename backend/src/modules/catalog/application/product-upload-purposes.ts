import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { AssetKind, ProductAsset } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { UploadPurposeRegistry, type UploadPurpose } from '../../uploads/application/upload-purpose';
import { IDENTICAL_FILE_MESSAGE, isSameFile, KIND_RULES, ProductAssetService } from './product-asset.service';

const MB = 1024 * 1024;

/** Options a product file may carry from the start of its upload. */
interface ProductFileContext {
  pageCount?: number;
}

/** "product.primary_file" and so on: one purpose per asset kind. */
export const productUploadPurpose = (kind: AssetKind) => `product.${kind.toLowerCase()}`;

/**
 * A product's files, uploaded straight to storage: one purpose per asset kind,
 * each recorded as the product's next version of that kind through the same
 * ProductAssetService.recordVersion as the multipart path. Covers are PUBLIC,
 * so they are checked in private staging and copied out once accepted.
 */
@Injectable()
export class ProductUploadPurposes implements OnModuleInit {
  constructor(
    private readonly registry: UploadPurposeRegistry,
    private readonly prisma: PrismaService,
    private readonly assets: ProductAssetService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    for (const kind of Object.values(AssetKind)) this.registry.register(this.purposeFor(kind));
  }

  private purposeFor(kind: AssetKind): UploadPurpose<ProductFileContext, ProductAsset> {
    const rule = KIND_RULES[kind];
    // Images are bounded for page weight; documents only by what storage holds.
    const limitMb = () =>
      kind === AssetKind.COVER_IMAGE
        ? this.config.get('MAX_IMAGE_UPLOAD_SIZE_MB')
        : this.config.get('MAX_DIRECT_UPLOAD_SIZE_MB');

    return {
      key: productUploadPurpose(kind),
      // The same as the admin product routes.
      roles: ['ADMIN', 'EDUCATOR'],
      visibility: rule.visibility,
      mimeTypes: rule.mimeTypes,
      maxBytes: () => limitMb() * MB,

      parseContext(raw) {
        const context = (raw ?? {}) as Record<string, unknown>;
        const pageCount = context.pageCount;
        if (pageCount !== undefined && !(Number.isInteger(pageCount) && (pageCount as number) >= 1)) {
          throw new BadRequestException('pageCount must be a whole number of pages.');
        }
        return pageCount === undefined ? {} : { pageCount: pageCount as number };
      },

      prepare: async ({ targetId }) => {
        if (!targetId) throw new BadRequestException('Say which product the file is for (targetId).');
        await this.assets.productOrThrow(targetId);
        return { keyPrefix: `products/${targetId}` };
      },

      // Re-uploading the current file is almost always a mistake, and a new
      // version for it would make the history meaningless — as on the multipart path.
      inspect: async ({ upload, info }) => {
        const current = await this.assets.currentVersion(upload.targetId!, kind);
        return isSameFile(current, { checksumSha256: null, checksumMd5: info.md5 })
          ? { message: IDENTICAL_FILE_MESSAGE, status: 409 }
          : null;
      },

      record: (tx, { upload, context, ref, info, actor }) =>
        this.assets.recordVersion(
          tx,
          {
            productId: upload.targetId!,
            kind,
            ref,
            originalFilename: upload.originalFilename,
            mimeType: upload.mimeType,
            sizeBytes: info.sizeBytes,
            checksumSha256: null,
            checksumMd5: info.md5,
            pageCount: context.pageCount,
          },
          actor,
        ),

      present: (resultId) => this.prisma.productAsset.findUniqueOrThrow({ where: { id: resultId } }),
    };
  }
}
