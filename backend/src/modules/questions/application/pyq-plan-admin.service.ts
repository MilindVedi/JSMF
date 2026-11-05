import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessType, EntitlementStatus, Prisma, ProductStatus, ProductType, type Product } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IS_PYQ_PLAN, PYQ_PLAN_KEY, approximateDays, readPyqPlan, type PyqPlanTerms } from '../../../shared/pyq-plan';
import { PyqPlansService } from './pyq-plans.service';
import { assertSubscriptionManagementEnabled, type Actor } from './subscription-management';

/** More than this on sale at once is a pricing page nobody can choose from. */
export const MAX_PLANS_ON_SALE = 6;

export interface PlanInput {
  title?: string;
  subtitle?: string | null;
  durationMonths: number;
  /** Paise, as a string: money never travels as a float. */
  priceAmountMinor: string;
  /** The struck-through "was" price. Display only; never charged. */
  compareAtAmountMinor?: string | null;
  popular?: boolean;
  /** Defaults to true: a new plan goes on sale at once. */
  onSale?: boolean;
}

export type PlanChanges = Partial<Omit<PlanInput, 'onSale'>>;

export interface AdminPlanView {
  id: string;
  title: string;
  subtitle: string | null;
  durationMonths: number | null;
  /** Older day-based plans only; null for every plan made here. */
  legacyDurationDays: number | null;
  /** Whole days a term bought today would last — for display. */
  approximateDays: number;
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  popular: boolean;
  onSale: boolean;
  /** Students whose access currently comes from this exact version. */
  activeSubscribers: number;
  createdAt: string;
}

/**
 * Creating, repricing and retiring PYQ subscription plans.
 *
 * Plans are products, so every sale goes through the same checkout,
 * settlement, refund and finance code as everything else. What is specific
 * to plans is three rules, all enforced here:
 *
 * 1. **Price and length are fixed per product.** Changing either makes a new
 *    product and retires the old one (`supersededBy`). An order is priced at
 *    checkout but its term is read at settlement, so editing in place would
 *    let a buyer who saw "12 months" mid-checkout be given one month. Old
 *    versions stay valid for whoever holds them.
 * 2. **A plan is never deleted or archived.** Access checks skip archived
 *    products, so archiving a plan would cut off everyone on it. Retiring a
 *    plan means taking it off sale; its holders keep their time.
 * 3. **Every write needs SUBSCRIPTION_MANAGEMENT_ENABLED** and is audited in
 *    the same transaction as the change.
 */
@Injectable()
export class PyqPlanAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly plans: PyqPlansService,
  ) {}

  /** Current versions only, on sale or not; retired versions are history. */
  async list(): Promise<AdminPlanView[]> {
    const products = await this.prisma.product.findMany({
      where: { ...IS_PYQ_PLAN, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const current = products.filter((p) => {
      const terms = readPyqPlan(p.metadata);
      return terms && !terms.supersededBy;
    });
    const counts = await this.activeSubscriberCounts(current.map((p) => p.id));
    return current
      .map((p) => toAdminView(p, counts.get(p.id) ?? 0))
      .sort((a, b) => a.approximateDays - b.approximateDays);
  }

  async create(input: PlanInput, actor: Actor): Promise<AdminPlanView> {
    assertSubscriptionManagementEnabled(this.config);
    const pricing = resolvePricing(input.priceAmountMinor, input.compareAtAmountMinor ?? null);
    const onSale = input.onSale ?? true;

    const product = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      if (onSale) await this.assertCanGoOnSale(tx, input.durationMonths, null);
      const created = await tx.product.create({
        data: planProductData({
          title: input.title,
          subtitle: input.subtitle ?? null,
          durationMonths: input.durationMonths,
          popular: input.popular ?? false,
          onSale,
          actorId: actor.id,
          ...pricing,
        }),
      });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'pyq.plan_created',
          entityType: 'product',
          entityId: created.id,
          after: auditShape(created),
          ip: actor.ip,
        },
        tx,
      );
      return created;
    });

    await this.plans.invalidate();
    return toAdminView(product, 0);
  }

  /**
   * Title, tagline, "was" price and the badge change in place. A new price or
   * length replaces the plan with a new version (rule 1) — the response is
   * then that new version, with a new id.
   */
  async update(id: string, changes: PlanChanges, actor: Actor): Promise<AdminPlanView> {
    assertSubscriptionManagementEnabled(this.config);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const before = await this.currentOrThrow(tx, id);
      const terms = readPyqPlan(before.metadata)!;

      const priceAmountMinor = changes.priceAmountMinor ?? before.priceAmountMinor.toString();
      const compareAtAmountMinor =
        changes.compareAtAmountMinor === undefined
          ? (before.compareAtAmountMinor?.toString() ?? null)
          : changes.compareAtAmountMinor;
      const pricing = resolvePricing(priceAmountMinor, compareAtAmountMinor);
      const durationMonths = changes.durationMonths ?? terms.durationMonths;

      const termsChanged =
        pricing.priceAmountMinor !== before.priceAmountMinor || durationMonths !== terms.durationMonths;

      const display = {
        title: changes.title === undefined ? before.title : changes.title,
        subtitle: changes.subtitle === undefined ? before.subtitle : changes.subtitle,
        popular: changes.popular ?? terms.popular,
      };

      if (!termsChanged) {
        const updated = await this.write(tx, before, {
          title: cleanTitle(display.title, durationMonths),
          subtitle: cleanSubtitle(display.subtitle),
          compareAtAmountMinor: pricing.compareAtAmountMinor,
          metadata: { ...(before.metadata as Prisma.JsonObject), popular: display.popular },
          updatedById: actor.id,
        });
        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'pyq.plan_updated',
            entityType: 'product',
            entityId: id,
            before: auditShape(before),
            after: auditShape(updated),
            ip: actor.ip,
          },
          tx,
        );
        return { product: updated, subscribers: await this.activeSubscriberCount(tx, id) };
      }

      if (!durationMonths) {
        throw new BadRequestException('Give this older plan a length in months to change its price.');
      }
      const onSale = before.status === ProductStatus.PUBLISHED;
      if (onSale) await this.assertCanGoOnSale(tx, durationMonths, before.id);

      const replacement = await tx.product.create({
        data: planProductData({
          title: display.title,
          subtitle: display.subtitle,
          durationMonths,
          popular: display.popular,
          onSale,
          actorId: actor.id,
          ...pricing,
        }),
      });
      await this.write(tx, before, {
        status: ProductStatus.UNPUBLISHED,
        metadata: { ...(before.metadata as Prisma.JsonObject), supersededBy: replacement.id },
        updatedById: actor.id,
      });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'pyq.plan_replaced',
          entityType: 'product',
          entityId: replacement.id,
          before: { id: before.id, ...auditShape(before) },
          after: { id: replacement.id, ...auditShape(replacement) },
          ip: actor.ip,
        },
        tx,
      );
      return { product: replacement, subscribers: 0 };
    });

    await this.plans.invalidate();
    return toAdminView(result.product, result.subscribers);
  }

  /** On sale, or off it. Off never touches anyone already on the plan. */
  async setOnSale(id: string, onSale: boolean, actor: Actor): Promise<AdminPlanView> {
    assertSubscriptionManagementEnabled(this.config);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const before = await this.currentOrThrow(tx, id);
      const wasOnSale = before.status === ProductStatus.PUBLISHED;
      if (wasOnSale === onSale) {
        return { product: before, subscribers: await this.activeSubscriberCount(tx, id) };
      }
      if (onSale) {
        const terms = readPyqPlan(before.metadata)!;
        if (!terms.durationMonths) {
          throw new BadRequestException('Give this older plan a length in months before putting it back on sale.');
        }
        await this.assertCanGoOnSale(tx, terms.durationMonths, before.id);
      }

      const updated = await this.write(tx, before, {
        status: onSale ? ProductStatus.PUBLISHED : ProductStatus.UNPUBLISHED,
        publishedAt: onSale ? (before.publishedAt ?? new Date()) : before.publishedAt,
        updatedById: actor.id,
      });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: onSale ? 'pyq.plan_put_on_sale' : 'pyq.plan_taken_off_sale',
          entityType: 'product',
          entityId: id,
          before: { status: before.status },
          after: { status: updated.status },
          ip: actor.ip,
        },
        tx,
      );
      return { product: updated, subscribers: await this.activeSubscriberCount(tx, id) };
    });

    await this.plans.invalidate();
    return toAdminView(result.product, result.subscribers);
  }

  // --- internals ----------------------------------------------------------------

  /** A current (not replaced, not archived) plan, or 404 / 409. */
  private async currentOrThrow(tx: Prisma.TransactionClient, id: string): Promise<Product> {
    const product = await tx.product.findFirst({ where: { id, deletedAt: null, ...IS_PYQ_PLAN } });
    const terms = product ? readPyqPlan(product.metadata) : null;
    if (!product || !terms) throw new NotFoundException('Plan not found');
    if (terms.supersededBy) {
      throw new ConflictException('This plan was replaced by a newer version. Refresh the page and edit that one.');
    }
    return product;
  }

  /**
   * Serialises every plan write, across API instances, until the transaction
   * ends. Without it two admins saving at once could both "replace" the same
   * plan, or both put a 3-month plan on sale, and each check would pass
   * because neither sees the other's uncommitted row. Plan edits are rare, so
   * one lock for all of them costs nothing.
   */
  private async lock(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('jsmf:pyq-plan-admin'))`;
  }

  private write(
    tx: Prisma.TransactionClient,
    before: Product,
    data: Prisma.ProductUncheckedUpdateInput,
  ): Promise<Product> {
    return tx.product.update({ where: { id: before.id }, data });
  }

  /** At most MAX_PLANS_ON_SALE on sale, and never two of the same length. */
  private async assertCanGoOnSale(tx: Prisma.TransactionClient, durationMonths: number, exceptId: string | null) {
    const onSale = await tx.product.findMany({
      where: {
        ...IS_PYQ_PLAN,
        status: ProductStatus.PUBLISHED,
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { title: true, metadata: true },
    });
    const current = onSale
      .map((p) => ({ title: p.title, terms: readPyqPlan(p.metadata) }))
      .filter((p): p is { title: string; terms: PyqPlanTerms } => !!p.terms && !p.terms.supersededBy);
    if (current.length >= MAX_PLANS_ON_SALE) {
      throw new ConflictException(`At most ${MAX_PLANS_ON_SALE} plans can be on sale at once. Take one off sale first.`);
    }
    const clash = current.find((p) => p.terms.durationMonths === durationMonths);
    if (clash) {
      throw new ConflictException(
        `"${clash.title}" is already on sale for ${monthsLabel(durationMonths)}. Change that plan instead, or take it off sale first.`,
      );
    }
  }

  private async activeSubscriberCounts(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.entitlement.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        status: EntitlementStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.productId, r._count._all]));
  }

  private activeSubscriberCount(tx: Prisma.TransactionClient, productId: string): Promise<number> {
    return tx.entitlement.count({
      where: {
        productId,
        status: EntitlementStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  }
}

// --- pure helpers -------------------------------------------------------------

function monthsLabel(months: number): string {
  return months === 1 ? '1 month' : `${months} months`;
}

function cleanTitle(title: string | undefined | null, durationMonths: number | null): string {
  const trimmed = title?.trim().replace(/\s+/g, ' ');
  if (trimmed) return trimmed;
  return durationMonths ? monthsLabel(durationMonths) : 'Plan';
}

function cleanSubtitle(subtitle: string | null | undefined): string | null {
  const trimmed = subtitle?.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed : null;
}

/** Parses and cross-checks the two amounts. The DTO has already bounded them. */
function resolvePricing(
  priceAmountMinor: string,
  compareAtAmountMinor: string | null,
): { priceAmountMinor: bigint; compareAtAmountMinor: bigint | null } {
  const price = BigInt(priceAmountMinor);
  const compareAt = compareAtAmountMinor === null ? null : BigInt(compareAtAmountMinor);
  if (price <= 0n) throw new BadRequestException('A plan must cost something. Use the free trial for free access.');
  if (compareAt !== null && compareAt <= price) {
    throw new BadRequestException('The "was" price must be higher than the price, or left empty.');
  }
  return { priceAmountMinor: price, compareAtAmountMinor: compareAt };
}

function planProductData(input: {
  title: string | undefined | null;
  subtitle: string | null;
  durationMonths: number;
  popular: boolean;
  onSale: boolean;
  actorId: string;
  priceAmountMinor: bigint;
  compareAtAmountMinor: bigint | null;
}): Prisma.ProductUncheckedCreateInput {
  return {
    // Random, not derived from the title: the slug is never shown, and a
    // replaced version must not collide with the one it replaces.
    slug: `pyq-plan-${input.durationMonths}m-${randomUUID().slice(0, 8)}`,
    title: cleanTitle(input.title, input.durationMonths),
    subtitle: cleanSubtitle(input.subtitle),
    type: ProductType.COURSE,
    accessType: AccessType.PAID,
    status: input.onSale ? ProductStatus.PUBLISHED : ProductStatus.UNPUBLISHED,
    publishedAt: input.onSale ? new Date() : null,
    // Checkout only sells listed products; plans never show in the store
    // anyway, because every store read excludes NOT_A_PYQ_PLAN.
    listed: true,
    priceAmountMinor: input.priceAmountMinor,
    compareAtAmountMinor: input.compareAtAmountMinor,
    currency: 'INR',
    metadata: { [PYQ_PLAN_KEY]: true, durationMonths: input.durationMonths, popular: input.popular },
    createdById: input.actorId,
    updatedById: input.actorId,
  };
}

function toAdminView(product: Product, activeSubscribers: number): AdminPlanView {
  const terms = readPyqPlan(product.metadata)!;
  return {
    id: product.id,
    title: product.title,
    subtitle: product.subtitle,
    durationMonths: terms.durationMonths,
    legacyDurationDays: terms.durationDays,
    approximateDays: approximateDays(terms),
    priceAmountMinor: product.priceAmountMinor.toString(),
    compareAtAmountMinor: product.compareAtAmountMinor?.toString() ?? null,
    popular: terms.popular,
    onSale: product.status === ProductStatus.PUBLISHED,
    activeSubscribers,
    createdAt: product.createdAt.toISOString(),
  };
}

/** What the audit trail keeps of a plan: the terms, not the whole row. */
function auditShape(product: Product) {
  return {
    title: product.title,
    status: product.status,
    priceAmountMinor: product.priceAmountMinor.toString(),
    compareAtAmountMinor: product.compareAtAmountMinor?.toString() ?? null,
    metadata: product.metadata,
  };
}
