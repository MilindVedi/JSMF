import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  JsmfApp,
  LegalChangeKind,
  LegalDocumentType,
  LegalVersionStatus,
  Prisma,
  type LegalDocumentVersion,
} from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  contentHash,
  nextVersion,
  normaliseSections,
  sectionsFor,
  versionOrder,
  type LegalSection,
} from '../domain/legal-document';

const CURRENT_CACHE_KEY = 'legal:current';
/** Short, because a version scheduled for later must take over close to its effective time. */
const CURRENT_TTL_SECONDS = 60;

export interface Actor {
  id: string;
  ip: string | null;
}

/** A published version as the cache and the public endpoints carry it. */
export interface PublishedVersion {
  id: string;
  type: LegalDocumentType;
  version: string;
  title: string;
  sections: LegalSection[];
  changeKind: LegalChangeKind;
  changeSummary: string | null;
  effectiveAt: string;
  publishedAt: string;
}

export interface CurrentDocuments {
  /** The version in force now, per type. */
  current: Partial<Record<LegalDocumentType, PublishedVersion>>;
  /**
   * The newest MAJOR version in force, per type: the line a user's acceptance
   * must be at or past. Accepting any later version (minor or major) counts.
   */
  baseline: Partial<Record<LegalDocumentType, { id: string; version: string }>>;
}

export interface DraftInput {
  title: string;
  sections: LegalSection[];
  /** The version this draft starts from — set when rolling back. */
  basedOnVersionId?: string | null;
}

export interface PublishInput {
  changeKind: LegalChangeKind;
  changeSummary: string;
  /** Later than now to schedule; omitted means "takes effect on publish". */
  effectiveAt?: Date;
}

/**
 * Terms, Privacy and Refund as versioned records.
 *
 * Which version is current is always worked out here — the newest published
 * version whose effective time has passed — and never taken from a client, so
 * an acceptance is always for the version the server says was in force.
 *
 * Immutability does not rely on this class: the database refuses any change to
 * a published row and any deletion of one (see the migration's triggers).
 */
@Injectable()
export class LegalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  // ─── Reading ──────────────────────────────────────────────────────────────

  /** Every type's current and baseline version, cached briefly. */
  currentDocuments(): Promise<CurrentDocuments> {
    return this.cache.wrap(CURRENT_CACHE_KEY, CURRENT_TTL_SECONDS, async () => {
      const published = await this.prisma.legalDocumentVersion.findMany({
        where: { status: LegalVersionStatus.PUBLISHED, effectiveAt: { lte: new Date() } },
      });
      const result: CurrentDocuments = { current: {}, baseline: {} };
      for (const type of Object.values(LegalDocumentType)) {
        const ofType = published
          .filter((v) => v.type === type)
          .sort((a, b) => versionOrder(b.version!) - versionOrder(a.version!));
        if (ofType.length === 0) continue;
        result.current[type] = toPublished(ofType[0]);
        const major = ofType.find((v) => v.changeKind === LegalChangeKind.MAJOR) ?? ofType[ofType.length - 1];
        result.baseline[type] = { id: major.id, version: major.version! };
      }
      return result;
    });
  }

  /** The version in force now, with only the sections `app` shows. */
  async current(type: LegalDocumentType, app?: JsmfApp): Promise<PublishedVersion> {
    const version = (await this.currentDocuments()).current[type];
    if (!version) throw new NotFoundException(`No ${type} document has been published`);
    return { ...version, sections: sectionsFor(version.sections, app) };
  }

  /** One published version by its number — so anyone can read what they accepted. */
  async published(type: LegalDocumentType, version: string, app?: JsmfApp): Promise<PublishedVersion> {
    const row = await this.prisma.legalDocumentVersion.findFirst({
      where: { type, version, status: LegalVersionStatus.PUBLISHED },
    });
    if (!row) throw new NotFoundException(`${type} version ${version} does not exist`);
    const out = toPublished(row);
    return { ...out, sections: sectionsFor(out.sections, app) };
  }

  /** Published versions of a type, newest first, without their text. */
  async publishedList(type: LegalDocumentType) {
    const rows = await this.prisma.legalDocumentVersion.findMany({
      where: { type, status: LegalVersionStatus.PUBLISHED },
      select: { version: true, title: true, changeKind: true, changeSummary: true, effectiveAt: true, publishedAt: true },
    });
    return rows.sort((a, b) => versionOrder(b.version!) - versionOrder(a.version!));
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  /** Per type: what is live, what is waiting, and the draft if any. */
  async overview() {
    const [{ current }, drafts, scheduled, counts] = await Promise.all([
      this.currentDocuments(),
      this.prisma.legalDocumentVersion.findMany({
        where: { status: LegalVersionStatus.DRAFT },
        select: { id: true, type: true, title: true, updatedAt: true, basedOnVersionId: true },
      }),
      this.prisma.legalDocumentVersion.findMany({
        where: { status: LegalVersionStatus.PUBLISHED, effectiveAt: { gt: new Date() } },
        select: { id: true, type: true, version: true, effectiveAt: true },
      }),
      this.prisma.legalDocumentVersion.groupBy({
        by: ['type'],
        where: { status: LegalVersionStatus.PUBLISHED },
        _count: { _all: true },
      }),
    ]);

    return Object.values(LegalDocumentType).map((type) => {
      const live = current[type];
      return {
        type,
        current: live
          ? { id: live.id, version: live.version, title: live.title, effectiveAt: live.effectiveAt, publishedAt: live.publishedAt }
          : null,
        scheduled: scheduled.filter((v) => v.type === type),
        draft: drafts.find((d) => d.type === type) ?? null,
        publishedCount: counts.find((c) => c.type === type)?._count._all ?? 0,
      };
    });
  }

  /** Every version of a type, drafts included, newest first — with who published it and how many accepted. */
  async history(type: LegalDocumentType) {
    const rows = await this.prisma.legalDocumentVersion.findMany({
      where: { type },
      select: {
        id: true,
        version: true,
        status: true,
        title: true,
        changeKind: true,
        changeSummary: true,
        contentHash: true,
        effectiveAt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        basedOn: { select: { version: true } },
        createdBy: { select: { name: true, email: true } },
        publishedBy: { select: { name: true, email: true } },
        _count: { select: { acceptances: true } },
      },
    });
    return rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === LegalVersionStatus.DRAFT ? -1 : 1;
      return versionOrder(b.version ?? '0.0') - versionOrder(a.version ?? '0.0');
    });
  }

  async version(id: string) {
    const row = await this.prisma.legalDocumentVersion.findUnique({
      where: { id },
      include: {
        basedOn: { select: { version: true } },
        createdBy: { select: { name: true, email: true } },
        publishedBy: { select: { name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('Version not found');
    return row;
  }

  /**
   * Creates the type's draft, or replaces the text of the existing one. The
   * published versions are untouched either way.
   */
  async saveDraft(type: LegalDocumentType, input: DraftInput, actor: Actor) {
    const sections = validateSections(input.sections);
    if (input.basedOnVersionId) {
      const base = await this.prisma.legalDocumentVersion.findUnique({ where: { id: input.basedOnVersionId } });
      if (!base || base.type !== type || base.status !== LegalVersionStatus.PUBLISHED) {
        throw new BadRequestException('A draft can only be based on a published version of the same document');
      }
    }

    const data = {
      title: input.title.trim(),
      sections: sections as unknown as Prisma.InputJsonValue,
      ...(input.basedOnVersionId !== undefined ? { basedOnVersionId: input.basedOnVersionId } : {}),
    };

    const existing = await this.prisma.legalDocumentVersion.findFirst({
      where: { type, status: LegalVersionStatus.DRAFT },
      select: { id: true },
    });
    const draft = existing
      ? await this.prisma.legalDocumentVersion.update({ where: { id: existing.id }, data })
      : await this.prisma.legalDocumentVersion
          .create({ data: { ...data, type, createdById: actor.id } })
          .catch((error: unknown) => {
            // Two admins creating the first draft at once: the partial unique
            // index lets only one through.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              throw new ConflictException('A draft was just created by someone else — reload to edit it');
            }
            throw error;
          });

    await this.audit.record({
      actorUserId: actor.id,
      action: existing ? 'legal_draft.updated' : 'legal_draft.created',
      entityType: 'legal_document_version',
      entityId: draft.id,
      after: { type, title: draft.title, basedOnVersionId: draft.basedOnVersionId },
      ip: actor.ip,
    });
    return draft;
  }

  /** Throws the draft away. Only ever a draft: the database refuses to delete a published row. */
  async discardDraft(type: LegalDocumentType, actor: Actor) {
    const draft = await this.prisma.legalDocumentVersion.findFirst({
      where: { type, status: LegalVersionStatus.DRAFT },
    });
    if (!draft) throw new NotFoundException('There is no draft to discard');
    await this.prisma.legalDocumentVersion.delete({ where: { id: draft.id } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'legal_draft.discarded',
      entityType: 'legal_document_version',
      entityId: draft.id,
      before: { type, title: draft.title },
      ip: actor.ip,
    });
  }

  /**
   * Turns the draft into the next numbered version. The number is assigned
   * here, from the newest published version; from this moment the row can
   * never change again.
   */
  async publish(type: LegalDocumentType, input: PublishInput, actor: Actor) {
    const now = new Date();
    const effectiveAt = input.effectiveAt ?? now;
    if (effectiveAt.getTime() < now.getTime() - 60_000) {
      throw new BadRequestException('The effective date cannot be in the past');
    }
    const summary = input.changeSummary.trim();
    if (!summary) throw new BadRequestException('Say what changed — it is shown in the history and to users');

    const published = await this.prisma.$transaction(
      async (tx) => {
        const draft = await tx.legalDocumentVersion.findFirst({ where: { type, status: LegalVersionStatus.DRAFT } });
        if (!draft) throw new NotFoundException('There is no draft to publish');

        const previous = (
          await tx.legalDocumentVersion.findMany({
            where: { type, status: LegalVersionStatus.PUBLISHED },
            select: { version: true, contentHash: true, effectiveAt: true },
          })
        ).sort((a, b) => versionOrder(b.version!) - versionOrder(a.version!))[0];

        const sections = draft.sections as unknown as LegalSection[];
        const hash = contentHash(draft.title, sections);
        if (previous?.contentHash === hash) {
          throw new BadRequestException('The draft is identical to the latest published version');
        }
        if (previous && effectiveAt < previous.effectiveAt!) {
          throw new BadRequestException('A new version cannot take effect before the one it replaces');
        }

        // The first version is always 1.0 and always the baseline.
        const changeKind = previous ? input.changeKind : LegalChangeKind.MAJOR;
        const row = await tx.legalDocumentVersion.update({
          where: { id: draft.id },
          data: {
            status: LegalVersionStatus.PUBLISHED,
            version: nextVersion(previous?.version ?? null, changeKind),
            contentHash: hash,
            changeKind,
            changeSummary: summary,
            effectiveAt,
            publishedAt: now,
            publishedById: actor.id,
          },
        });

        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'legal_version.published',
            entityType: 'legal_document_version',
            entityId: row.id,
            after: { type, version: row.version, changeKind, effectiveAt, contentHash: hash },
            ip: actor.ip,
          },
          tx,
        );
        return row;
      },
      // Two publishes racing would compute the same number; serialising them
      // turns the second into a retryable failure instead of a duplicate.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.cache.del(CURRENT_CACHE_KEY);
    return published;
  }

  /** Called by the seed and after a publish elsewhere: drops the cached current versions. */
  invalidate() {
    return this.cache.del(CURRENT_CACHE_KEY);
  }
}

export function toPublished(row: LegalDocumentVersion): PublishedVersion {
  return {
    id: row.id,
    type: row.type,
    version: row.version!,
    title: row.title,
    sections: row.sections as unknown as LegalSection[],
    changeKind: row.changeKind!,
    changeSummary: row.changeSummary,
    effectiveAt: row.effectiveAt!.toISOString(),
    publishedAt: row.publishedAt!.toISOString(),
  };
}

function validateSections(input: LegalSection[]): LegalSection[] {
  const sections = normaliseSections(input);
  if (sections.length === 0) throw new BadRequestException('A document needs at least one section');
  const ids = new Set<string>();
  for (const s of sections) {
    if (!s.body) throw new BadRequestException('Every section needs some text');
    if (ids.has(s.id)) throw new BadRequestException(`Two sections share the id "${s.id}"`);
    ids.add(s.id);
  }
  return sections;
}
