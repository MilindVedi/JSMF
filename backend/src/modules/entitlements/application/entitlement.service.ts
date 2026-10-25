import { Injectable, Logger } from '@nestjs/common';
import {
  AssetKind,
  DownloadPolicy,
  Entitlement,
  EntitlementSource,
  EntitlementStatus,
  Prisma,
  ProductType,
} from '@prisma/client';
import { NOT_A_PYQ_PLAN } from '../../../shared/pyq-plan';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface GrantInput {
  userId: string;
  productId: string;
  source: EntitlementSource;
  sourceOrderId?: string | null;
  sourceProductId?: string | null;
  expiresAt?: Date | null;
  /**
   * When access began, if not now — an offline sale is dated at its real
   * payment. Only used when this call creates the entitlement.
   */
  grantedAt?: Date;
}

/**
 * Access control, and the only table that answers "may this person have this
 * file".
 *
 * Everything that can confer access — a paid order, a free claim, an admin
 * gift, a bundle, a future subscription — writes here, so the download path has
 * exactly one question to ask rather than a growing chain of special cases.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grants access, idempotently.
   *
   * Idempotency is enforced by the database, not by checking first: the partial
   * unique index `entitlements_user_product_active_unique` (on user_id,
   * product_id WHERE status = 'ACTIVE') rejects a second concurrent grant. A
   * read-then-write check would have a window between the two where a duplicate
   * webhook and the browser's verify call could both pass.
   *
   * The conflict is absorbed by `ON CONFLICT DO NOTHING` (`skipDuplicates`)
   * rather than by catching the unique violation, because this usually runs
   * inside the caller's transaction — `settle` grants one entitlement per order
   * item — and in Postgres a raised constraint error **aborts that whole
   * transaction**. The recovery query would then fail too, rolling back a
   * settlement that had in fact succeeded moments earlier on the other path.
   * That turned the very race this method exists to tolerate into an error for
   * whichever caller arrived second. Not raising it in the first place keeps
   * the transaction alive, at the cost of one extra SELECT per grant.
   */
  async grant(input: GrantInput, tx?: Prisma.TransactionClient): Promise<Entitlement> {
    const db = tx ?? this.prisma;

    const inserted = await db.entitlement.createMany({
      data: [
        {
          userId: input.userId,
          productId: input.productId,
          source: input.source,
          sourceOrderId: input.sourceOrderId ?? null,
          sourceProductId: input.sourceProductId ?? null,
          status: EntitlementStatus.ACTIVE,
          expiresAt: input.expiresAt ?? null,
          ...(input.grantedAt && { grantedAt: input.grantedAt, createdAt: input.grantedAt }),
        },
      ],
      skipDuplicates: true,
    });

    const entitlement = await db.entitlement.findFirst({
      where: {
        userId: input.userId,
        productId: input.productId,
        status: EntitlementStatus.ACTIVE,
      },
    });

    if (!entitlement) {
      // Nothing was inserted and nothing is active: the insert conflicted with
      // something other than the active-grant index, which is not a race this
      // method may quietly swallow.
      throw new Error(
        `Entitlement for user ${input.userId} / product ${input.productId} was neither created nor found`,
      );
    }

    if (inserted.count === 0) {
      // Already entitled. The expected outcome of a redelivered webhook or a
      // verify call racing one, not an error.
      this.logger.debug(
        `Entitlement already active for user ${input.userId} / product ${input.productId}`,
      );
    }

    return entitlement;
  }

  /**
   * Grants a product and, when it is a bundle, every PDF in it.
   *
   * The PDFs are granted as BUNDLE, carrying the same order (so refunding the
   * bundle takes them back with it) and the bundle as their source (so the
   * library shows them inside the bundle's card). Bundles hold PDFs only,
   * never other bundles, so one level is the whole tree. Anything the person
   * already holds another way is left as it is: `grant` is idempotent.
   */
  async grantWithContents(input: GrantInput, tx?: Prisma.TransactionClient): Promise<Entitlement> {
    const db = tx ?? this.prisma;
    const entitlement = await this.grant(input, tx);
    const contents = await db.productBundleItem.findMany({
      where: { bundleProductId: input.productId, bundle: { type: ProductType.BUNDLE }, child: { deletedAt: null } },
      orderBy: { sortOrder: 'asc' },
      select: { childProductId: true },
    });
    for (const item of contents) {
      await this.grant(
        {
          userId: input.userId,
          productId: item.childProductId,
          source: EntitlementSource.BUNDLE,
          sourceOrderId: input.sourceOrderId ?? null,
          sourceProductId: input.productId,
          grantedAt: input.grantedAt,
        },
        tx,
      );
    }
    return entitlement;
  }

  /** The single access check. Null means no live entitlement. */
  async findActive(userId: string, productId: string): Promise<Entitlement | null> {
    const entitlement = await this.prisma.entitlement.findFirst({
      where: { userId, productId, status: EntitlementStatus.ACTIVE },
    });

    // An expiry in the past is not access, even though the row still says
    // ACTIVE — nothing sweeps expired rows synchronously, so the check has to
    // happen at read time. V1 grants are perpetual (expiresAt null), but
    // subscriptions will not be.
    if (entitlement?.expiresAt && entitlement.expiresAt <= new Date()) return null;

    return entitlement;
  }

  /**
   * Whether the user holds any live entitlement to a product matching
   * `product` — for access that is granted by a *kind* of product (a PYQ
   * subscription plan) rather than one specific product id. Same expiry rule
   * as `findActive`.
   */
  async hasActiveMatching(userId: string, product: Prisma.ProductWhereInput): Promise<boolean> {
    const found = await this.prisma.entitlement.findFirst({
      where: {
        userId,
        status: EntitlementStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        product,
      },
      select: { id: true },
    });
    return found !== null;
  }

  /** Used when a payment is refunded or an admin withdraws access. */
  async revoke(
    entitlementId: string,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    // status and revoked_at must move together — entitlements_revocation_is_coherent
    // rejects a REVOKED row with no timestamp, and vice versa.
    await db.entitlement.update({
      where: { id: entitlementId },
      data: {
        status: EntitlementStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  async revokeForOrder(
    orderId: string,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;

    const affected = await db.entitlement.updateMany({
      where: { sourceOrderId: orderId, status: EntitlementStatus.ACTIVE },
      data: {
        status: EntitlementStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    return affected.count;
  }

  /** The buyer's library. */
  async listForUser(userId: string) {
    const rows = await this.prisma.entitlement.findMany({
      // A seat at a live session is an entitlement too, but it is not a file:
      // listed here it would show a Download button with nothing behind it.
      // The planner that comes with the session is a PDF, so it still appears.
      where: {
        userId,
        status: EntitlementStatus.ACTIVE,
        // Same for a PYQ plan: it unlocks the practice app, there is no file.
        product: { type: { not: ProductType.LIVE_SESSION }, AND: [NOT_A_PYQ_PLAN] },
      },
      orderBy: { grantedAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            title: true,
            subtitle: true,
            type: true,
            accessType: true,
            status: true,
            // Unlisted products have no store page, so the library shows the
            // title without a link.
            listed: true,
            // Whether the card offers Download beside Read.
            downloadPolicy: true,
            // The cover the library card shows, as the store's own cards do.
            assets: {
              where: { isCurrent: true, kind: AssetKind.COVER_IMAGE },
              take: 1,
              select: { storageProvider: true, bucket: true, objectKey: true },
            },
          },
        },
        // Where a session handout came from, for the library's label.
        sourceProduct: { select: { id: true, title: true, type: true, liveSession: { select: { shortName: true } } } },
      },
    });

    // A bundle is one card listing the PDFs this person holds from it. Those
    // PDFs are then shown only inside the card, however they were acquired:
    // the bundle is how the person thinks of them.
    const bundleIds = rows.filter((r) => r.product.type === ProductType.BUNDLE).map((r) => r.productId);
    const items = bundleIds.length
      ? await this.prisma.productBundleItem.findMany({
          where: { bundleProductId: { in: bundleIds }, child: { deletedAt: null } },
          orderBy: { sortOrder: 'asc' },
          select: {
            bundleProductId: true,
            child: { select: { id: true, title: true, subtitle: true, downloadPolicy: true } },
          },
        })
      : [];
    const held = new Set(rows.map((r) => r.productId));
    const contentsOf = new Map<
      string,
      Array<{ id: string; title: string; subtitle: string | null; downloadPolicy: DownloadPolicy }>
    >();
    for (const item of items) {
      if (!held.has(item.child.id)) continue;
      const list = contentsOf.get(item.bundleProductId) ?? [];
      list.push(item.child);
      contentsOf.set(item.bundleProductId, list);
    }
    const insideABundle = new Set([...contentsOf.values()].flat().map((c) => c.id));

    // The label names a session by its short name when it has one — the
    // stable name, not the booking card's title, which admins reword daily.
    // Same rule as the emails (events/domain/session-display.ts).
    // `product.assets` carries the cover's storage address; LibraryController
    // turns it into a URL, as CatalogController does for the store's cards.
    return rows
      .filter((row) => !insideABundle.has(row.productId))
      .map(({ sourceProduct, ...row }) => ({
        ...row,
        sourceProduct: sourceProduct && {
          id: sourceProduct.id,
          type: sourceProduct.type,
          title: sourceProduct.liveSession?.shortName?.trim() || sourceProduct.title,
        },
        /** For a bundle: the PDFs in it that this person can read. Null otherwise. */
        contents: row.product.type === ProductType.BUNDLE ? (contentsOf.get(row.productId) ?? []) : null,
      }));
  }
}
