import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessType, AssetKind, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from './entitlement.service';

export interface ReadingPosition {
  productId: string;
  /** The file version `page` belongs to; null if that version has since gone. */
  assetId: string | null;
  page: number;
  pageCount: number;
  updatedAt: Date;
}

/**
 * Where each signed-in reader is in each product, so the reader reopens at the
 * same page on any device. One row per (user, product), overwritten as they
 * read: this is a bookmark of position, not a reading history.
 *
 * A visitor without an account keeps their place in their own browser; nothing
 * of theirs is stored here.
 */
@Injectable()
export class ReadingProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
  ) {}

  async get(userId: string, productId: string): Promise<ReadingPosition | null> {
    return this.prisma.readingProgress.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { productId: true, assetId: true, page: true, pageCount: true, updatedAt: true },
    });
  }

  /** Positions for many products at once — the library's progress bars. */
  async forProducts(userId: string, productIds: string[]): Promise<Map<string, ReadingPosition>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.readingProgress.findMany({
      where: { userId, productId: { in: productIds } },
      select: { productId: true, assetId: true, page: true, pageCount: true, updatedAt: true },
    });
    return new Map(rows.map((row) => [row.productId, row]));
  }

  /**
   * Saves where the reader is. Only for something they may read — the same
   * rule as opening it — so this table cannot become a list of products a
   * person merely knows the ids of.
   */
  async save(
    userId: string,
    productId: string,
    input: { page: number; pageCount: number; assetId?: string | null },
  ): Promise<ReadingPosition> {
    if (input.page < 1 || input.pageCount < 1 || input.page > input.pageCount) {
      throw new BadRequestException('page must be between 1 and pageCount.');
    }

    await this.assertReadable(userId, productId);

    // Only a version of this product's own file (not its sample or cover);
    // anything else is dropped rather than refused, since the position itself
    // is still worth keeping.
    const assetId = input.assetId
      ? ((
          await this.prisma.productAsset.findFirst({
            where: { id: input.assetId, productId, kind: AssetKind.PRIMARY_FILE },
            select: { id: true },
          })
        )?.id ?? null)
      : null;

    const data = { page: input.page, pageCount: input.pageCount, assetId };
    return this.prisma.readingProgress.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, ...data },
      update: data,
      select: { productId: true, assetId: true, page: true, pageCount: true, updatedAt: true },
    });
  }

  /** The same rule as ContentAccessService's READ, which is what opened the reader. */
  private async assertReadable(userId: string, productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { accessType: true, status: true, listed: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (await this.entitlements.findActive(userId, productId)) return;

    const freeInStore =
      product.accessType === AccessType.FREE && product.status === ProductStatus.PUBLISHED && product.listed;
    if (!freeInStore) throw new ForbiddenException('You cannot read this product.');
  }
}
