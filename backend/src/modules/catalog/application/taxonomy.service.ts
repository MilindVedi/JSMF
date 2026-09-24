import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, Taxonomy, TaxonomyTerm } from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SLUG_PATTERN, slugify } from '../domain/slug';
import { ACTIVE, type Actor } from './product.service';

export interface CreateTaxonomyInput {
  key: string;
  name: string;
  description?: string;
  isHierarchical?: boolean;
  isMultiSelect?: boolean;
  sortOrder?: number;
}

export interface CreateTermInput {
  taxonomyId: string;
  name: string;
  slug?: string;
  description?: string;
  parentTermId?: string | null;
  sortOrder?: number;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Taxonomies are the platform's answer to "we will want to categorise by
 * something else later".
 *
 * Adding a category kind — Difficulty, Year, Doctor — is a row in `taxonomies`
 * plus its terms. No migration, no deploy, and no code in this file changes,
 * because nothing here names a specific taxonomy. The admin form and the
 * storefront filters both render from these tables.
 */
@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- taxonomies ---------------------------------------------------------

  /** Everything needed to render an admin form or a filter sidebar in one call. */
  listWithTerms() {
    return this.prisma.taxonomy.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        terms: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
  }

  /**
   * The same taxonomies, but containing only terms that actually have a
   * published product behind them — and dropping any taxonomy left with none.
   *
   * This is what the storefront filters render from. Showing all 19 MBBS
   * subjects while two of them have content advertises a library that does not
   * exist, and every empty filter is a dead end a visitor can click into. The
   * admin panel deliberately still uses `listWithTerms`, because an editor
   * assigning categories needs to see every option, including unused ones.
   *
   * The counts come back with it, so the UI can show "3 resources" next to a
   * filter without a second round trip.
   */
  async listWithTermsInUse() {
    const taxonomies = await this.prisma.taxonomy.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        terms: {
          where: {
            deletedAt: null,
            // A term counts as "in use" only via a product a visitor could
            // actually open — published, not archived, not soft-deleted.
            products: {
              some: {
                product: {
                  status: ProductStatus.PUBLISHED,
                  deletedAt: null,
                },
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            _count: {
              select: {
                products: {
                  where: {
                    product: { status: ProductStatus.PUBLISHED, deletedAt: null },
                  },
                },
              },
            },
          },
        },
      },
    });

    return taxonomies
      .filter((taxonomy) => taxonomy.terms.length > 0)
      .map((taxonomy) => ({
        ...taxonomy,
        terms: taxonomy.terms.map(({ _count, ...term }) => ({
          ...term,
          productCount: _count.products,
        })),
      }));
  }

  async createTaxonomy(input: CreateTaxonomyInput, actor: Actor): Promise<Taxonomy> {
    const key = slugify(input.key);

    if (!SLUG_PATTERN.test(key)) {
      throw new BadRequestException('A taxonomy key must look like `difficulty` or `exam-year`.');
    }

    if (await this.prisma.taxonomy.findUnique({ where: { key }, select: { id: true } })) {
      throw new ConflictException(`A taxonomy with key "${key}" already exists.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const taxonomy = await tx.taxonomy.create({
        data: {
          key,
          name: input.name,
          description: input.description,
          isHierarchical: input.isHierarchical ?? false,
          isMultiSelect: input.isMultiSelect ?? true,
          sortOrder: input.sortOrder ?? 0,
        },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'taxonomy.created',
          entityType: 'taxonomy',
          entityId: taxonomy.id,
          after: taxonomy,
          ip: actor.ip,
        },
        tx,
      );

      return taxonomy;
    });
  }

  /**
   * `key` is intentionally absent from what can be updated: it is how code and
   * saved storefront filter links refer to a taxonomy, so renaming it would
   * break them silently. The display `name` is freely editable.
   */
  async updateTaxonomy(
    id: string,
    input: Partial<Omit<CreateTaxonomyInput, 'key'>>,
    actor: Actor,
  ): Promise<Taxonomy> {
    const before = await this.prisma.taxonomy.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Taxonomy not found');

    return this.prisma.$transaction(async (tx) => {
      const taxonomy = await tx.taxonomy.update({ where: { id }, data: input });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'taxonomy.updated',
          entityType: 'taxonomy',
          entityId: id,
          before,
          after: taxonomy,
          ip: actor.ip,
        },
        tx,
      );

      return taxonomy;
    });
  }

  // --- terms --------------------------------------------------------------

  async createTerm(input: CreateTermInput, actor: Actor): Promise<TaxonomyTerm> {
    const taxonomy = await this.prisma.taxonomy.findUnique({
      where: { id: input.taxonomyId },
    });

    if (!taxonomy) throw new NotFoundException('Taxonomy not found');

    const slug = slugify(input.slug ?? input.name);

    if (!SLUG_PATTERN.test(slug)) {
      throw new BadRequestException('A term slug must be lowercase words separated by hyphens.');
    }

    // Scoped to live rows: the uniqueness that matters is
    // taxonomy_terms_taxonomy_id_slug_active_unique, a partial index on
    // WHERE deleted_at IS NULL, so a slug freed up by soft-deleting a term is
    // reusable — this check has to agree with what the database will actually
    // accept.
    const clash = await this.prisma.taxonomyTerm.findFirst({
      where: { taxonomyId: input.taxonomyId, slug, deletedAt: null },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException(`"${slug}" already exists in ${taxonomy.name}.`);
    }

    if (input.parentTermId) {
      await this.assertParentExists(input.parentTermId);
    }

    return this.prisma.$transaction(async (tx) => {
      const term = await tx.taxonomyTerm.create({
        data: {
          taxonomyId: input.taxonomyId,
          parentTermId: input.parentTermId ?? null,
          slug,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder ?? 0,
          metadata: input.metadata ?? {},
        },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'taxonomy_term.created',
          entityType: 'taxonomy_term',
          entityId: term.id,
          after: term,
          ip: actor.ip,
        },
        tx,
      );

      return term;
    });
  }

  async updateTerm(
    id: string,
    input: Partial<Omit<CreateTermInput, 'taxonomyId'>>,
    actor: Actor,
  ): Promise<TaxonomyTerm> {
    const before = await this.prisma.taxonomyTerm.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Term not found');

    if (input.parentTermId) {
      await this.assertParentExists(input.parentTermId);
      await this.assertNoCycle(id, input.parentTermId);
    }

    const slug = input.slug === undefined ? undefined : slugify(input.slug);

    if (slug !== undefined && slug !== before.slug) {
      const clash = await this.prisma.taxonomyTerm.findFirst({
        where: { taxonomyId: before.taxonomyId, slug, deletedAt: null },
        select: { id: true },
      });
      if (clash) throw new ConflictException(`"${slug}" already exists in this taxonomy.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const term = await tx.taxonomyTerm.update({
        where: { id },
        data: { ...input, slug },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'taxonomy_term.updated',
          entityType: 'taxonomy_term',
          entityId: id,
          before,
          after: term,
          ip: actor.ip,
        },
        tx,
      );

      return term;
    });
  }

  /**
   * Soft-deletes the term, refusing while it is still in use or still has
   * (live) children.
   *
   * The database would refuse a hard delete anyway — both relations are
   * `onDelete: Restrict`, chosen precisely so that removing "Pathology" cannot
   * silently strip that tag from every product carrying it. This check exists
   * to turn that into a sentence saying how many products are affected, so the
   * admin can untag them deliberately rather than being told only that a
   * constraint failed. Being a soft delete on top of that means a term retired
   * by mistake is one call to `restoreTerm` away from being back, description,
   * id and history intact — not recreated from scratch with a new id that
   * nothing already tagged points at.
   */
  async deleteTerm(id: string, actor: Actor): Promise<void> {
    const term = await this.prisma.taxonomyTerm.findFirst({ where: { id, deletedAt: null } });
    if (!term) throw new NotFoundException('Term not found');

    const [usageCount, childCount] = await Promise.all([
      this.prisma.productTaxonomyTerm.count({ where: { termId: id } }),
      this.prisma.taxonomyTerm.count({ where: { parentTermId: id, deletedAt: null } }),
    ]);

    if (usageCount > 0) {
      throw new ConflictException(
        `"${term.name}" is still applied to ${usageCount} product(s). Remove it from them first.`,
      );
    }

    if (childCount > 0) {
      throw new ConflictException(
        `"${term.name}" still has ${childCount} child term(s). Remove or reparent them first.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.taxonomyTerm.update({ where: { id }, data: { deletedAt: new Date() } });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'taxonomy_term.deleted',
          entityType: 'taxonomy_term',
          entityId: id,
          before: term,
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  async restoreTerm(id: string, actor: Actor): Promise<TaxonomyTerm> {
    const term = await this.prisma.taxonomyTerm.findUnique({ where: { id } });
    if (!term) throw new NotFoundException('Term not found');
    if (!term.deletedAt) return term;

    // The slot this slug occupies may have been taken by a newer term created
    // after the soft delete — the partial unique index permits exactly that.
    // Restoring into an occupied slug would violate it, so it is checked here
    // for a clear error instead of a raw constraint-violation 500.
    const clash = await this.prisma.taxonomyTerm.findFirst({
      where: { taxonomyId: term.taxonomyId, slug: term.slug, deletedAt: null, id: { not: id } },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException(
        `"${term.slug}" is now used by a different term in this taxonomy. Rename one before restoring.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.taxonomyTerm.update({
        where: { id },
        data: { deletedAt: null },
      });

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'taxonomy_term.restored',
          entityType: 'taxonomy_term',
          entityId: id,
          after: restored,
          ip: actor.ip,
        },
        tx,
      );

      return restored;
    });
  }

  // --- assignment ---------------------------------------------------------

  /**
   * Replaces a product's entire set of terms in one call.
   *
   * Set-semantics rather than add/remove endpoints: the admin form submits the
   * state it wants, so there is no sequence of partial updates that can leave
   * the product half-tagged if one request fails.
   */
  async setProductTerms(productId: string, termIds: string[], actor: Actor): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...ACTIVE },
      select: { id: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    const unique = [...new Set(termIds)];

    const terms = await this.prisma.taxonomyTerm.findMany({
      where: { id: { in: unique }, deletedAt: null },
      include: { taxonomy: true },
    });

    if (terms.length !== unique.length) {
      throw new BadRequestException('One or more of the given terms does not exist.');
    }

    // Honours `is_multi_select`, which is the whole reason that column exists:
    // a product can carry several subjects but only one difficulty, and which
    // is which is data rather than a rule written into this file.
    const perTaxonomy = new Map<string, { name: string; count: number; multi: boolean }>();
    for (const term of terms) {
      const entry = perTaxonomy.get(term.taxonomyId) ?? {
        name: term.taxonomy.name,
        count: 0,
        multi: term.taxonomy.isMultiSelect,
      };
      entry.count++;
      perTaxonomy.set(term.taxonomyId, entry);
    }

    for (const entry of perTaxonomy.values()) {
      if (!entry.multi && entry.count > 1) {
        throw new BadRequestException(
          `${entry.name} allows only one value, but ${entry.count} were given.`,
        );
      }
    }

    const before = await this.prisma.productTaxonomyTerm.findMany({
      where: { productId },
      select: { termId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.productTaxonomyTerm.deleteMany({ where: { productId } });

      if (unique.length > 0) {
        await tx.productTaxonomyTerm.createMany({
          data: unique.map((termId) => ({ productId, termId })),
        });
      }

      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'product.terms_set',
          entityType: 'product',
          entityId: productId,
          before: { termIds: before.map((row) => row.termId) },
          after: { termIds: unique },
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  // --- helpers ------------------------------------------------------------

  private async assertParentExists(parentTermId: string): Promise<void> {
    const parent = await this.prisma.taxonomyTerm.findFirst({
      where: { id: parentTermId, deletedAt: null },
      select: { id: true },
    });

    if (!parent) throw new BadRequestException('The given parent term does not exist.');
  }

  /**
   * The database's CHECK constraint only stops a term being its own direct
   * parent. A longer loop — A → B → A — would make every ancestor walk hang,
   * so it is caught here by walking up from the proposed parent.
   */
  private async assertNoCycle(termId: string, parentTermId: string): Promise<void> {
    let cursor: string | null = parentTermId;
    let hops = 0;

    while (cursor !== null) {
      if (cursor === termId) {
        throw new BadRequestException(
          'That parent would create a loop in the term hierarchy.',
        );
      }

      if (++hops > 50) {
        throw new BadRequestException('The term hierarchy is nested too deeply.');
      }

      const parent: { parentTermId: string | null } | null =
        await this.prisma.taxonomyTerm.findUnique({
          where: { id: cursor },
          select: { parentTermId: true },
        });

      cursor = parent?.parentTermId ?? null;
    }
  }
}
