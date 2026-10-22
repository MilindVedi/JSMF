import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  AccessType,
  EntitlementSource,
  EntitlementStatus,
  ProductStatus,
  ProductType,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from './entitlement.service';
import { LibraryBookmarkService } from './library-bookmark.service';

/**
 * Bookmarks in the reader's library: only what they hold, idempotent both
 * ways, and gone from the library once their access is. Real Postgres (dev
 * stack); every row is deleted by id at the end.
 */
const prisma = new PrismaService();
const bookmarks = new LibraryBookmarkService(prisma);
const entitlements = new EntitlementService(prisma);

let reader: string;
let stranger: string;
let held: string;
let notHeld: string;

beforeAll(async () => {
  const user = (label: string) =>
    prisma.user.create({
      data: { email: `bookmark-spec-${label}-${randomUUID()}@jsmf.test`, name: 'Bookmark Spec', status: UserStatus.ACTIVE },
    });
  const pdf = (label: string) =>
    prisma.product.create({
      data: {
        slug: `bookmark-spec-${label}-${randomUUID()}`,
        title: `Bookmark Spec ${label}`,
        type: ProductType.PDF,
        accessType: AccessType.FREE,
        status: ProductStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  [reader, stranger] = (await Promise.all([user('reader'), user('stranger')])).map((u) => u.id);
  [held, notHeld] = (await Promise.all([pdf('held'), pdf('not-held')])).map((p) => p.id);
  await entitlements.grant({ userId: reader, productId: held, source: EntitlementSource.FREE_CLAIM });
});

afterAll(async () => {
  await prisma.libraryBookmark.deleteMany({ where: { userId: { in: [reader, stranger] } } });
  await prisma.entitlement.deleteMany({ where: { userId: { in: [reader, stranger] } } });
  await prisma.product.deleteMany({ where: { id: { in: [held, notHeld] } } });
  await prisma.user.deleteMany({ where: { id: { in: [reader, stranger] } } });
  await prisma.$disconnect();
});

describe('LibraryBookmarkService', () => {
  it('bookmarks something the reader holds, once however often it is asked', async () => {
    await bookmarks.add(reader, held);
    await bookmarks.add(reader, held);
    expect(await prisma.libraryBookmark.count({ where: { userId: reader } })).toBe(1);
    expect([...(await bookmarks.idsFor(reader))]).toEqual([held]);
  });

  it('refuses something the reader does not hold', async () => {
    await expect(bookmarks.add(reader, notHeld)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(bookmarks.add(stranger, held)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.libraryBookmark.count({ where: { userId: stranger } })).toBe(0);
  });

  it('keeps each reader\'s bookmarks to themselves', async () => {
    expect((await bookmarks.idsFor(stranger)).size).toBe(0);
  });

  it('removes one, and removing it again is not an error', async () => {
    await bookmarks.remove(reader, held);
    await bookmarks.remove(reader, held);
    expect((await bookmarks.idsFor(reader)).size).toBe(0);
  });

  it('a revoked item can no longer be bookmarked, and drops out of the library', async () => {
    await bookmarks.add(reader, held);
    await prisma.entitlement.updateMany({
      where: { userId: reader, productId: held },
      data: { status: EntitlementStatus.REVOKED, revokedAt: new Date() },
    });
    await expect(bookmarks.add(reader, held)).rejects.toBeInstanceOf(ForbiddenException);
    const library = await entitlements.listForUser(reader);
    expect(library.some((row) => row.productId === held)).toBe(false);
  });
});
