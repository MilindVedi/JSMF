import { ForbiddenException, Injectable } from '@nestjs/common';
import { EntitlementStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

/**
 * The reader's bookmarks in their library.
 *
 * Deliberately not audited: a bookmark is a reader's own note to self, it
 * changes no access and no money, and an audit row per tap would bury the
 * entries that matter.
 */
@Injectable()
export class LibraryBookmarkService {
  constructor(private readonly prisma: PrismaService) {}

  /** The product ids this reader has bookmarked. */
  async idsFor(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.libraryBookmark.findMany({
      where: { userId },
      select: { productId: true },
    });
    return new Set(rows.map((row) => row.productId));
  }

  /**
   * Bookmarks one. Idempotent: a second tap, or a retry after a dropped
   * response, leaves the one row there is.
   *
   * Only something the reader holds — otherwise this would be a way to probe
   * which product ids exist, and a bookmark nobody can see in their library.
   */
  async add(userId: string, productId: string): Promise<void> {
    const held = await this.prisma.entitlement.findFirst({
      where: { userId, productId, status: EntitlementStatus.ACTIVE },
      select: { id: true },
    });
    if (!held) throw new ForbiddenException('Only something in your library can be bookmarked.');

    await this.prisma.libraryBookmark.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
  }

  /** Removes one. Removing one that is not there is not an error. */
  async remove(userId: string, productId: string): Promise<void> {
    await this.prisma.libraryBookmark.deleteMany({ where: { userId, productId } });
  }
}
