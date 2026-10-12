import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  JsmfApp,
  LegalAcceptanceContext,
  LegalDocumentType,
  LegalVersionStatus,
  Prisma,
} from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ACCEPTANCE_KIND, REQUIRED_DOCUMENTS, versionOrder } from '../domain/legal-document';
import { LegalDocumentsService } from './legal-documents.service';

/** How long "this user is up to date" is remembered. The key embeds the baseline, so a new major version misses it at once. */
const UP_TO_DATE_TTL_SECONDS = 300;

export interface AcceptInput {
  documents: LegalDocumentType[];
  app: JsmfApp;
  context: LegalAcceptanceContext;
  orderId?: string;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Who accepted which version, and when.
 *
 * An acceptance is only ever recorded here, from an explicit user action the
 * apps send — never as a side effect of signing up, paying or browsing. The
 * version is resolved on the server at that moment; the request only names
 * the document type. Rows are insert-only (a trigger enforces it), so
 * accepting a newer version adds to the trail rather than replacing it.
 */
@Injectable()
export class LegalAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly documents: LegalDocumentsService,
    private readonly config: AppConfig,
  ) {}

  get enforced(): boolean {
    return this.config.get('LEGAL_ACCEPTANCE_REQUIRED');
  }

  /** Per document: what is current, what this user last accepted, and whether they must act. */
  async status(userId: string) {
    const [{ current, baseline }, accepted] = await Promise.all([
      this.documents.currentDocuments(),
      this.latestAccepted(userId),
    ]);

    const documents = Object.values(LegalDocumentType).flatMap((type) => {
      const live = current[type];
      if (!live) return [];
      const mine = accepted.get(type) ?? null;
      const upToDate = mine !== null && versionOrder(mine.version) >= versionOrder(baseline[type]!.version);
      return [
        {
          type,
          current: {
            version: live.version,
            title: live.title,
            effectiveAt: live.effectiveAt,
            changeKind: live.changeKind,
            changeSummary: live.changeSummary,
          },
          accepted: mine && { version: mine.version, acceptedAt: mine.acceptedAt },
          /** Accepted at or past the latest major version. */
          upToDate,
          /** A newer version than the one accepted exists — worth a notice even when not required. */
          hasUpdate: mine !== null && mine.version !== live.version,
          required: this.enforced && REQUIRED_DOCUMENTS.includes(type) && !upToDate,
        },
      ];
    });

    return { enforced: this.enforced, documents };
  }

  /**
   * The required documents this user has not accepted, for the guard. Empty
   * whenever enforcement is off. Only the "nothing pending" answer is cached.
   */
  async pending(userId: string): Promise<LegalDocumentType[]> {
    if (!this.enforced) return [];
    const { baseline } = await this.documents.currentDocuments();
    const key = `legal:ok:${userId}:${REQUIRED_DOCUMENTS.map((t) => baseline[t]?.id ?? '-').join(',')}`;

    const ok = await this.cache.wrap(key, UP_TO_DATE_TTL_SECONDS, async () => {
      const accepted = await this.latestAccepted(userId);
      return REQUIRED_DOCUMENTS.every((type) => {
        const line = baseline[type];
        const mine = accepted.get(type);
        return !line || (mine !== undefined && versionOrder(mine.version) >= versionOrder(line.version));
      });
    });
    if (ok) return [];

    // Not cached as "pending": accepting must take effect on the very next request.
    await this.cache.del(key);
    const { documents } = await this.status(userId);
    return documents.filter((d) => d.required).map((d) => d.type);
  }

  /** Records acceptance of the version in force right now of each named document. */
  async accept(userId: string, input: AcceptInput, meta: RequestMeta) {
    const types = [...new Set(input.documents)];
    if (types.length === 0) throw new BadRequestException('Name at least one document');

    if (input.context === LegalAcceptanceContext.CHECKOUT) {
      if (!input.orderId) throw new BadRequestException('A checkout acknowledgement needs its order');
      const order = await this.prisma.order.findFirst({ where: { id: input.orderId, userId }, select: { id: true } });
      if (!order) throw new NotFoundException('Order not found');
    } else if (input.orderId) {
      throw new BadRequestException('An order is only recorded for a checkout acknowledgement');
    }

    // Read fresh, not from the cache: an acceptance must name the version
    // that is in force at this instant, even if it took over seconds ago.
    const versions = await this.prisma.legalDocumentVersion.findMany({
      where: { type: { in: types }, status: LegalVersionStatus.PUBLISHED, effectiveAt: { lte: new Date() } },
      select: { id: true, type: true, version: true },
    });

    const recorded = [];
    for (const type of types) {
      const live = versions
        .filter((v) => v.type === type)
        .sort((a, b) => versionOrder(b.version!) - versionOrder(a.version!))[0];
      if (!live) throw new NotFoundException(`No ${type} document has been published`);

      // Accepting the same version twice adds nothing to the trail — except at
      // checkout, where each order carries its own acknowledgement.
      if (input.context !== LegalAcceptanceContext.CHECKOUT) {
        const existing = await this.prisma.legalAcceptance.findFirst({
          where: { userId, versionId: live.id },
          select: { acceptedAt: true },
        });
        if (existing) {
          recorded.push({ type, version: live.version!, acceptedAt: existing.acceptedAt });
          continue;
        }
      }

      const row = await this.prisma.legalAcceptance.create({
        data: {
          userId,
          versionId: live.id,
          kind: ACCEPTANCE_KIND[type],
          context: input.context,
          app: input.app,
          orderId: input.orderId ?? null,
          ipAddress: meta.ip?.slice(0, 45) ?? null,
          userAgent: meta.userAgent?.slice(0, 512) ?? null,
        },
        select: { acceptedAt: true },
      });
      recorded.push({ type, version: live.version!, acceptedAt: row.acceptedAt });
    }
    return { recorded };
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  /** The acceptance trail, newest first, filterable by document, version and user. */
  async list(params: { type?: LegalDocumentType; versionId?: string; search?: string; page: number; pageSize: number }) {
    const search = params.search?.trim();
    const where: Prisma.LegalAcceptanceWhereInput = {
      ...(params.versionId ? { versionId: params.versionId } : {}),
      ...(params.type ? { version: { type: params.type } } : {}),
      ...(search
        ? {
            user: {
              OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.legalAcceptance.count({ where }),
      this.prisma.legalAcceptance.findMany({
        where,
        orderBy: { acceptedAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          kind: true,
          context: true,
          app: true,
          orderId: true,
          acceptedAt: true,
          ipAddress: true,
          userAgent: true,
          user: { select: { id: true, name: true, email: true, phone: true } },
          version: { select: { id: true, type: true, version: true } },
        },
      }),
    ]);
    return { total, page: params.page, pageSize: params.pageSize, items: rows };
  }

  /** How many accounts are at or past each document's current baseline. */
  async coverage() {
    const { current, baseline } = await this.documents.currentDocuments();
    const totalUsers = await this.prisma.user.count();
    const result = [];
    for (const type of Object.values(LegalDocumentType)) {
      const line = baseline[type];
      if (!line || !current[type]) continue;
      const atOrPast = (
        await this.prisma.legalDocumentVersion.findMany({
          where: { type, status: LegalVersionStatus.PUBLISHED },
          select: { id: true, version: true },
        })
      )
        .filter((v) => versionOrder(v.version!) >= versionOrder(line.version))
        .map((v) => v.id);
      const accepted = await this.prisma.legalAcceptance.findMany({
        where: { versionId: { in: atOrPast } },
        distinct: ['userId'],
        select: { userId: true },
      });
      result.push({ type, baselineVersion: line.version, currentVersion: current[type]!.version, accepted: accepted.length, totalUsers });
    }
    return result;
  }

  /** Each document's newest version this user accepted. */
  private async latestAccepted(userId: string) {
    const rows = await this.prisma.legalAcceptance.findMany({
      where: { userId },
      select: { acceptedAt: true, version: { select: { type: true, version: true } } },
    });
    const latest = new Map<LegalDocumentType, { version: string; acceptedAt: Date }>();
    for (const row of rows) {
      const seen = latest.get(row.version.type);
      if (!seen || versionOrder(row.version.version!) > versionOrder(seen.version)) {
        latest.set(row.version.type, { version: row.version.version!, acceptedAt: row.acceptedAt });
      }
    }
    return latest;
  }
}
