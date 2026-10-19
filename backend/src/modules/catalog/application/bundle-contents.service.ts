import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetKind, EntitlementSource, EntitlementStatus, Prisma, ProductType } from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { ACTIVE, type Actor } from './product.service';

/**
 * What a PDF bundle contains: store PDFs, in order, sold together as one
 * product (`product_bundle_items`, the same table a session's "included with
 * a seat" uses).
 *
 * A bundle holds PDFs only — never another bundle, a session or a call — so
 * granting one is never more than one level deep (EntitlementService
 * .grantWithContents).
 *
 * Each PDF stays its own product. Whether it is also sold on its own is its
 * own "Show in store" (`listed`): on, it is in the store and inside its
 * bundles; off, it can be had only through a bundle. The admin may set it
 * while adding (`sellOnItsOwn`), and change it any time after. A PDF may be
 * in any number of bundles.
 *
 * Everyone who has the bundle has its current contents. A PDF added is given
 * to every holder at once; a PDF removed is taken back from everyone who had
 * it through this bundle (anyone who has it another way keeps it). Seat
 * holders who get the bundle as a day material follow the same rule through
 * the session's own reconcile.
 */
@Injectable()
export class BundleContentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  /** The bundle's PDFs, and how many people an "add for everyone" would reach. */
  async list(bundleId: string) {
    await this.bundleOrThrow(bundleId);
    const items = await this.prisma.productBundleItem.findMany({
      where: { bundleProductId: bundleId, child: ACTIVE },
      orderBy: { sortOrder: 'asc' },
      select: {
        child: {
          select: {
            id: true,
            title: true,
            status: true,
            listed: true,
            assets: { where: { kind: AssetKind.PRIMARY_FILE, isCurrent: true }, select: { pageCount: true } },
          },
        },
      },
    });
    return {
      items: items.map(({ child }) => ({
        productId: child.id,
        title: child.title,
        status: child.status,
        listed: child.listed,
        pageCount: child.assets[0]?.pageCount ?? null,
      })),
      holders: await this.holdersOutsideSessions(bundleId).then((h) => h.length),
    };
  }

  async add(bundleId: string, input: { productId: string; sellOnItsOwn?: boolean }, actor: Actor) {
    await this.bundleOrThrow(bundleId);
    if (input.productId === bundleId) throw new BadRequestException('A bundle cannot contain itself.');
    const child = await this.prisma.product.findFirst({
      where: { id: input.productId, ...ACTIVE },
      select: {
        id: true,
        type: true,
        title: true,
        listed: true,
        assets: { where: { kind: AssetKind.PRIMARY_FILE, isCurrent: true }, select: { id: true } },
      },
    });
    if (!child) throw new NotFoundException('That PDF was not found, or it is archived.');
    if (child.type !== ProductType.PDF) throw new BadRequestException('A bundle can only contain PDFs.');
    if (child.assets.length === 0) {
      throw new BadRequestException(`"${child.title}" has no PDF uploaded yet. Upload its file first.`);
    }

    const position = await this.prisma.productBundleItem.count({ where: { bundleProductId: bundleId } });
    try {
      await this.prisma.productBundleItem.create({
        data: { bundleProductId: bundleId, childProductId: child.id, sortOrder: position },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`"${child.title}" is already in this bundle.`);
      }
      throw error;
    }

    // Left as it was unless the admin chose otherwise while adding.
    const listed = input.sellOnItsOwn ?? child.listed;
    if (listed !== child.listed) {
      await this.prisma.product.update({ where: { id: child.id }, data: { listed, updatedById: actor.id } });
    }

    let given = 0;
    for (const holder of await this.holdersOutsideSessions(bundleId)) {
      const already = await this.entitlements.findActive(holder.userId, child.id);
      if (already) continue;
      await this.entitlements.grant({
        userId: holder.userId,
        productId: child.id,
        source: EntitlementSource.BUNDLE,
        // The holder's own route to the bundle: refunding it takes this too.
        sourceOrderId: holder.sourceOrderId,
        sourceProductId: bundleId,
      });
      given += 1;
    }

    await this.audit.record({
      actorUserId: actor.id,
      action: 'bundle.item_added',
      entityType: 'product',
      entityId: bundleId,
      after: { childProductId: child.id, sellOnItsOwn: listed, given },
      ip: actor.ip,
    });
    return { ...(await this.list(bundleId)), given };
  }

  /**
   * Removes a PDF from the bundle, and takes it back from everyone who had it
   * only through this bundle. Anyone who has it another way (bought it on its
   * own, a session) keeps it. Its "Show in store" is left as it is.
   */
  async remove(bundleId: string, childProductId: string, actor: Actor) {
    await this.bundleOrThrow(bundleId);
    const { removed, revoked } = await this.prisma.$transaction(async (tx) => {
      const removed = await tx.productBundleItem.deleteMany({
        where: { bundleProductId: bundleId, childProductId },
      });
      const revoked = await tx.entitlement.updateMany({
        where: {
          productId: childProductId,
          source: EntitlementSource.BUNDLE,
          sourceProductId: bundleId,
          status: EntitlementStatus.ACTIVE,
        },
        data: { status: EntitlementStatus.REVOKED, revokedAt: new Date(), revokedReason: 'Removed from the bundle' },
      });
      return { removed: removed.count, revoked: revoked.count };
    });
    if (removed === 0) throw new NotFoundException('That PDF is not in this bundle.');
    if (revoked > 0) await this.regrantFromOtherBundles(childProductId);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'bundle.item_removed',
      entityType: 'product',
      entityId: bundleId,
      before: { childProductId },
      after: { revoked },
      ip: actor.ip,
    });
    return { ...(await this.list(bundleId)), revoked };
  }

  /** Moves the bundle's PDFs into the given order (ids not given keep their place after). */
  async reorder(bundleId: string, productIds: string[], actor: Actor) {
    await this.bundleOrThrow(bundleId);
    const current = await this.prisma.productBundleItem.findMany({
      where: { bundleProductId: bundleId },
      orderBy: { sortOrder: 'asc' },
      select: { childProductId: true },
    });
    const known = new Set(current.map((c) => c.childProductId));
    const ordered = [
      ...productIds.filter((id) => known.has(id)),
      ...current.map((c) => c.childProductId).filter((id) => !productIds.includes(id)),
    ];
    await this.prisma.$transaction(
      ordered.map((childProductId, sortOrder) =>
        this.prisma.productBundleItem.update({
          where: { bundleProductId_childProductId: { bundleProductId: bundleId, childProductId } },
          data: { sortOrder },
        }),
      ),
    );
    await this.audit.record({
      actorUserId: actor.id,
      action: 'bundle.reordered',
      entityType: 'product',
      entityId: bundleId,
      after: { order: ordered },
      ip: actor.ip,
    });
    return this.list(bundleId);
  }

  // --- internals ----------------------------------------------------------------

  /**
   * One person holds a PDF once, however many of their bundles include it, so
   * removing it from one bundle may have taken the copy another still owes
   * them. Give it back through that other bundle.
   */
  private async regrantFromOtherBundles(childProductId: string) {
    const others = await this.prisma.productBundleItem.findMany({
      where: { childProductId, bundle: { type: ProductType.BUNDLE, ...ACTIVE } },
      select: { bundleProductId: true },
    });
    for (const { bundleProductId } of others) {
      for (const holder of await this.holdersOutsideSessions(bundleProductId)) {
        if (await this.entitlements.findActive(holder.userId, childProductId)) continue;
        await this.entitlements.grant({
          userId: holder.userId,
          productId: childProductId,
          source: EntitlementSource.BUNDLE,
          sourceOrderId: holder.sourceOrderId,
          sourceProductId: bundleProductId,
        });
      }
    }
  }

  private async bundleOrThrow(bundleId: string) {
    const bundle = await this.prisma.product.findFirst({
      where: { id: bundleId, ...ACTIVE },
      select: { id: true, type: true },
    });
    if (!bundle) throw new NotFoundException('Product not found');
    if (bundle.type !== ProductType.BUNDLE) throw new BadRequestException('This product is not a bundle.');
    return bundle;
  }

  /**
   * Everyone holding the bundle except through a session's day materials:
   * those follow the bundle's current contents through the session's own
   * reconcile, so granting them here as well would leave a copy the session
   * could not take back.
   */
  private holdersOutsideSessions(bundleId: string) {
    return this.prisma.entitlement.findMany({
      where: {
        productId: bundleId,
        status: EntitlementStatus.ACTIVE,
        source: { not: EntitlementSource.SESSION_MATERIAL },
      },
      select: { userId: true, sourceOrderId: true },
    });
  }
}
