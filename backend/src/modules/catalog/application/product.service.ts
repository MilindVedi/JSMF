import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessType,
  AssetKind,
  LinkKind,
  Prisma,
  Product,
  ProductStatus,
  ProductType,
} from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SLUG_PATTERN, slugify, uniqueSlug } from '../domain/slug';

/**
 * The soft-delete filter, defined once.
 *
 * Nothing on this platform is hard-deleted, which means every read has to
 * exclude archived rows — and a single query that forgets to is a bug that
 * shows deleted products to customers. Spelling it once and spreading it makes
 * the omission visible in review: a `where` clause in this file without
 * `...ACTIVE` stands out.
 */
export const ACTIVE = { deletedAt: null } as const;

export interface CreateProductInput {
  type?: ProductType;
  title: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  accessType: AccessType;
  priceAmountMinor?: string;
  compareAtAmountMinor?: string | null;
  currency?: string;
  language?: string;
  authorUserId?: string;
  metadata?: Prisma.InputJsonValue;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export interface AdminProductQuery {
  status?: ProductStatus;
  type?: ProductType;
  q?: string;
  page?: number;
  pageSize?: number;
  /** Archived products are excluded unless explicitly asked for. */
  includeArchived?: boolean;
}

export interface PublicProductQuery {
  q?: string;
  type?: ProductType;
  /**
   * Taxonomy term slugs, ANDed. Generic on purpose: a new taxonomy kind added
   * tomorrow is filterable through this same parameter with no code change,
   * which is the whole point of the taxonomy tables.
   */
  terms?: string[];
  accessType?: AccessType;
  page?: number;
  pageSize?: number;
}

export interface Actor {
  id: string;
  ip?: string | null;
}

export interface ProductLinkInput {
  kind: LinkKind;
  url: string;
  label?: string;
  sortOrder?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- writes -------------------------------------------------------------

  async create(input: CreateProductInput, actor: Actor): Promise<Product> {
    const pricing = this.resolvePricing(input.accessType, input);
    const slug = await this.resolveSlug(input.slug ?? input.title);

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          type: input.type ?? ProductType.PDF,
          slug,
          title: input.title,
          subtitle: input.subtitle,
          description: input.description,
          status: ProductStatus.DRAFT,
          accessType: input.accessType,
          ...pricing,
          currency: input.currency ?? 'INR',
          language: input.language ?? 'en',
          authorUserId: input.authorUserId,
          metadata: input.metadata ?? {},
          createdById: actor.id,
          updatedById: actor.id,
        },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'product.created',
          entityType: 'product',
          entityId: product.id,
          after: product,
          ip: actor.ip,
        },
        tx,
      );

      return product;
    });
  }

  async update(id: string, input: UpdateProductInput, actor: Actor): Promise<Product> {
    const before = await this.getOrThrow(id);

    const accessType = input.accessType ?? before.accessType;
    const pricing =
      input.accessType !== undefined ||
      input.priceAmountMinor !== undefined ||
      input.compareAtAmountMinor !== undefined
        ? this.resolvePricing(accessType, {
            priceAmountMinor:
              input.priceAmountMinor ?? before.priceAmountMinor.toString(),
            compareAtAmountMinor:
              input.compareAtAmountMinor === undefined
                ? (before.compareAtAmountMinor?.toString() ?? null)
                : input.compareAtAmountMinor,
          })
        : {};

    const slug = input.slug === undefined ? {} : { slug: await this.resolveSlugChange(before, input.slug) };

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          ...slug,
          title: input.title,
          subtitle: input.subtitle,
          description: input.description,
          accessType: input.accessType,
          ...pricing,
          currency: input.currency,
          language: input.language,
          authorUserId: input.authorUserId,
          metadata: input.metadata,
          updatedById: actor.id,
        },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'product.updated',
          entityType: 'product',
          entityId: id,
          before,
          after: product,
          ip: actor.ip,
        },
        tx,
      );

      return product;
    });
  }

  /**
   * Publishing is the moment a product becomes a link someone can paste into a
   * YouTube description, so the precondition is checked here rather than left
   * to the admin remembering: a published product with no file is a broken
   * promise to every viewer who clicks it.
   */
  async publish(id: string, actor: Actor): Promise<Product> {
    const before = await this.getOrThrow(id);

    const primaryFile = await this.prisma.productAsset.findFirst({
      where: { productId: id, kind: AssetKind.PRIMARY_FILE, isCurrent: true },
      select: { id: true },
    });

    if (!primaryFile) {
      throw new ConflictException(
        'This product has no current primary file. Upload the PDF before publishing.',
      );
    }

    return this.transition(before, ProductStatus.PUBLISHED, 'product.published', actor, {
      // Set once and then preserved: publishedAt records the first time this
      // went live, so unpublishing and republishing does not rewrite history.
      publishedAt: before.publishedAt ?? new Date(),
    });
  }

  async unpublish(id: string, actor: Actor): Promise<Product> {
    return this.transition(
      await this.getOrThrow(id),
      ProductStatus.UNPUBLISHED,
      'product.unpublished',
      actor,
    );
  }

  /**
   * The soft delete. There is deliberately no hard-delete path: a product that
   * has ever been sold is referenced by order items and entitlements with
   * `onDelete: Restrict`, so deleting it would either fail or, worse, be made
   * to succeed by removing the records of what people bought.
   */
  async archive(id: string, actor: Actor): Promise<Product> {
    return this.transition(
      await this.getOrThrow(id),
      ProductStatus.ARCHIVED,
      'product.archived',
      actor,
      { deletedAt: new Date() },
    );
  }

  /** Archiving is reversible; that is the point of it being a status change. */
  async restore(id: string, actor: Actor): Promise<Product> {
    const before = await this.prisma.product.findUnique({ where: { id } });

    if (!before) throw new NotFoundException('Product not found');
    if (before.status !== ProductStatus.ARCHIVED) {
      throw new ConflictException('Only an archived product can be restored');
    }

    return this.transition(before, ProductStatus.DRAFT, 'product.restored', actor, {
      deletedAt: null,
    });
  }

  private async transition(
    before: Product,
    status: ProductStatus,
    action: string,
    actor: Actor,
    extra: Prisma.ProductUncheckedUpdateInput = {},
  ): Promise<Product> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: before.id },
        data: { status, updatedById: actor.id, ...extra },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action,
          entityType: 'product',
          entityId: before.id,
          before: { status: before.status },
          after: { status: product.status },
          ip: actor.ip,
        },
        tx,
      );

      return product;
    });
  }

  // --- links --------------------------------------------------------------

  /**
   * A product's outbound links (the YouTube video it accompanies, an Instagram
   * reel). A table rather than a `youtube_url` column, so "also link the reel"
   * is data entry rather than a migration.
   */
  async addLink(productId: string, input: ProductLinkInput, actor: Actor) {
    await this.getOrThrow(productId);

    return this.prisma.$transaction(async (tx) => {
      const link = await tx.productLink.create({
        data: {
          productId,
          kind: input.kind,
          url: input.url,
          label: input.label,
          sortOrder: input.sortOrder ?? 0,
        },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'product.link_added',
          entityType: 'product_link',
          entityId: link.id,
          after: link,
          ip: actor.ip,
        },
        tx,
      );

      return link;
    });
  }

  /** Soft delete: the URL and label are recoverable, not gone. */
  async removeLink(productId: string, linkId: string, actor: Actor): Promise<void> {
    const link = await this.prisma.productLink.findFirst({
      where: { id: linkId, productId, deletedAt: null },
    });
    if (!link) throw new NotFoundException('Link not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.productLink.update({ where: { id: linkId }, data: { deletedAt: new Date() } });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'product.link_removed',
          entityType: 'product_link',
          entityId: linkId,
          before: link,
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  async restoreLink(productId: string, linkId: string, actor: Actor) {
    const link = await this.prisma.productLink.findFirst({ where: { id: linkId, productId } });
    if (!link) throw new NotFoundException('Link not found');
    if (!link.deletedAt) return link;

    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.productLink.update({
        where: { id: linkId },
        data: { deletedAt: null },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'product.link_restored',
          entityType: 'product_link',
          entityId: linkId,
          after: restored,
          ip: actor.ip,
        },
        tx,
      );

      return restored;
    });
  }

  // --- reads --------------------------------------------------------------

  async getOrThrow(id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({ where: { id, ...ACTIVE } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findForAdmin(query: AdminProductQuery) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);

    const where: Prisma.ProductWhereInput = {
      ...(query.includeArchived ? {} : ACTIVE),
      status: query.status,
      type: query.type,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          assets: { where: { isCurrent: true }, select: { id: true, kind: true } },
          taxonomyTerms: { include: { term: { include: { taxonomy: true } } } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findPublic(query: PublicProductQuery) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);

    const where: Prisma.ProductWhereInput = {
      ...ACTIVE,
      status: ProductStatus.PUBLISHED,
      type: query.type,
      accessType: query.accessType,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      // One nested `every`-style condition per term rather than `in`, because
      // `in` would match a product carrying ANY of the terms. Filters have to
      // narrow: picking Anatomy *and* NEET-PG must not widen the results.
      ...(query.terms?.length
        ? {
            AND: query.terms.map((slug) => ({
              taxonomyTerms: { some: { term: { slug, deletedAt: null } } },
            })),
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take,
        include: {
          assets: {
            where: { isCurrent: true, kind: AssetKind.COVER_IMAGE },
            select: { id: true, kind: true, storageProvider: true, bucket: true, objectKey: true },
          },
          taxonomyTerms: {
            where: { term: { deletedAt: null } },
            include: { term: { include: { taxonomy: true } } },
          },
          // Just enough to render a "has an accompanying video" badge on the
          // storefront card — not the full link list a product page needs, so
          // this stays a lightweight `id` rather than pulling in every link's
          // URL and label for every card on every listing page.
          links: {
            where: { kind: LinkKind.YOUTUBE, deletedAt: null },
            select: { id: true },
            take: 1,
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findPublicBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.PUBLISHED, ...ACTIVE },
      include: {
        // Only the metadata a storefront needs. Object keys for private assets
        // are deliberately not selected: a buyer gets a signed URL from the
        // download endpoint, never an address they could try to fetch directly.
        assets: {
          where: { isCurrent: true },
          select: {
            id: true,
            kind: true,
            sizeBytes: true,
            pageCount: true,
            mimeType: true,
            originalFilename: true,
          },
        },
        // Soft-deleted links and terms are hidden from the public page, but not
        // filtered from admin detail below — an admin needs to see them to
        // restore one.
        links: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        taxonomyTerms: {
          where: { term: { deletedAt: null } },
          include: { term: { include: { taxonomy: true } } },
        },
        author: { select: { id: true, name: true } },
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    // The cover's storage address is fetched separately rather than widened
    // into the `assets` select above, because that select covers every kind —
    // adding bucket/objectKey there would hand the browser the PRIMARY_FILE's
    // address too, which is the one thing this endpoint must never return.
    // COVER_IMAGE is the only public-bucket kind, so it is safe on its own.
    const cover = await this.prisma.productAsset.findFirst({
      where: { productId: product.id, isCurrent: true, kind: AssetKind.COVER_IMAGE },
      select: { storageProvider: true, bucket: true, objectKey: true, kind: true },
    });

    return { ...product, cover };
  }

  async findAdminDetail(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        assets: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
        links: { orderBy: { sortOrder: 'asc' } },
        taxonomyTerms: { include: { term: { include: { taxonomy: true } } } },
      },
    });

    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // --- rules --------------------------------------------------------------

  /**
   * Mirrors the `products_price_matches_access_type` and
   * `products_compare_at_above_price` CHECK constraints.
   *
   * The database is the guarantee; this is here so the admin gets a sentence
   * explaining what is wrong instead of a constraint-violation stack trace.
   */
  private resolvePricing(
    accessType: AccessType,
    input: { priceAmountMinor?: string; compareAtAmountMinor?: string | null },
  ): { priceAmountMinor: bigint; compareAtAmountMinor: bigint | null } {
    const price = parseMinor(input.priceAmountMinor ?? '0', 'priceAmountMinor');
    const compareAt =
      input.compareAtAmountMinor === undefined || input.compareAtAmountMinor === null
        ? null
        : parseMinor(input.compareAtAmountMinor, 'compareAtAmountMinor');

    if (accessType === AccessType.FREE && price !== 0n) {
      throw new BadRequestException('A FREE product must have a price of 0.');
    }

    if (accessType === AccessType.PAID && price <= 0n) {
      throw new BadRequestException('A PAID product must have a price greater than 0.');
    }

    if (compareAt !== null && compareAt <= price) {
      throw new BadRequestException(
        'The compare-at price must be higher than the actual price, or omitted.',
      );
    }

    return { priceAmountMinor: price, compareAtAmountMinor: compareAt };
  }

  private async resolveSlug(source: string): Promise<string> {
    return uniqueSlug(slugify(source), async (candidate) => {
      const existing = await this.prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return existing !== null;
    });
  }

  /**
   * A published slug is effectively permanent — it is the link in a YouTube
   * description that this platform exists to serve. Changing it silently turns
   * every one of those into a 404, so it is only editable before the product
   * has ever gone live.
   */
  private async resolveSlugChange(before: Product, desired: string): Promise<string> {
    if (before.status !== ProductStatus.DRAFT || before.publishedAt !== null) {
      throw new ConflictException(
        'The slug cannot be changed after a product has been published, because the ' +
          'old link may already be shared publicly. Archive this product and create a ' +
          'replacement if the URL genuinely has to change.',
      );
    }

    if (!SLUG_PATTERN.test(desired)) {
      throw new BadRequestException(
        'A slug must be lowercase letters, numbers and single hyphens, e.g. neet-pg-anatomy.',
      );
    }

    if (desired === before.slug) return desired;

    const taken = await this.prisma.product.findUnique({
      where: { slug: desired },
      select: { id: true },
    });

    if (taken) throw new ConflictException(`The slug "${desired}" is already in use.`);

    return desired;
  }
}

function paginate(page?: number, pageSize?: number) {
  const resolvedPage = Math.max(1, page ?? 1);
  const resolvedSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE));

  return {
    page: resolvedPage,
    pageSize: resolvedSize,
    skip: (resolvedPage - 1) * resolvedSize,
    take: resolvedSize,
  };
}

/**
 * Money arrives as a string, because it leaves as a string: BigInt is
 * serialised to JSON as a string to avoid the precision loss `Number` would
 * introduce, and accepting a number back would reintroduce it at the boundary.
 */
function parseMinor(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(
      `${field} must be a whole number of paise, sent as a string (e.g. "19900" for ₹199).`,
    );
  }

  return BigInt(value);
}
