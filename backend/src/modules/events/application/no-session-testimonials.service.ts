import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { Actor } from '../../catalog/application/product.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';

const SINGLETON_ID = 'global';

/** The headings the admin picks from, then may edit. The first is the default. */
export const NO_SESSION_HEADING_OPTIONS = [
  'What students said after the last session.',
  'Feedbacks from previous sessions.',
] as const;

export const NO_SESSION_DEFAULT_SUBHEADING =
  'From a previous revision session. A few moments students shared afterward.';

/** Only the session's original gallery, as on its own page. */
const ORIGINAL_GALLERY = { sectionId: null } as const;

export interface NoSessionTestimonialsInput {
  enabled?: boolean;
  /** Null = automatic: the most recent past session that has any. */
  sessionId?: string | null;
  heading?: string | null;
  subheading?: string | null;
}

/**
 * The testimonials band on the home page and /prep-kit while no session is
 * upcoming. Without it that band simply disappeared between sessions, which
 * is exactly when a visitor has nothing else to go on.
 *
 * Stored on the singleton `platform_settings` row; the public side rides on
 * `GET /sessions` (LiveSessionController) rather than `GET /settings`, so the
 * page gets it in the request it already makes.
 */
@Injectable()
export class NoSessionTestimonialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  /** What the website shows, or null for nothing (off, or no screenshots anywhere). */
  async forWebsite(): Promise<{ heading: string; subheading: string; urls: string[] } | null> {
    const settings = await this.row();
    if (!settings.noSessionTestimonialsEnabled) return null;

    const sessionId = settings.noSessionTestimonialsSessionId ?? (await this.latestWithTestimonials());
    if (!sessionId) return null;

    const rows = await this.prisma.sessionTestimonial.findMany({
      where: { liveSessionId: sessionId, ...ORIGINAL_GALLERY, liveSession: { product: { deletedAt: null } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (rows.length === 0) return null;

    return {
      heading: settings.noSessionTestimonialsHeading ?? NO_SESSION_HEADING_OPTIONS[0],
      subheading: settings.noSessionTestimonialsSubheading ?? NO_SESSION_DEFAULT_SUBHEADING,
      urls: await Promise.all(
        rows.map((row) => this.storage.getSignedDownloadUrl(objectRefOf(row), { disposition: 'inline' })),
      ),
    };
  }

  /** The stored setting, the choices, and which session "automatic" means right now. */
  async forAdmin() {
    const settings = await this.row();
    const sessions = await this.prisma.liveSession.findMany({
      where: { product: { deletedAt: null }, testimonials: { some: ORIGINAL_GALLERY } },
      orderBy: { startsAt: { sort: 'desc', nulls: 'last' } },
      select: {
        productId: true,
        startsAt: true,
        shortName: true,
        product: { select: { title: true, status: true } },
        _count: { select: { testimonials: { where: ORIGINAL_GALLERY } } },
      },
    });
    const automaticId = await this.latestWithTestimonials();

    return {
      enabled: settings.noSessionTestimonialsEnabled,
      sessionId: settings.noSessionTestimonialsSessionId,
      heading: settings.noSessionTestimonialsHeading,
      subheading: settings.noSessionTestimonialsSubheading,
      headingOptions: [...NO_SESSION_HEADING_OPTIONS],
      defaultSubheading: NO_SESSION_DEFAULT_SUBHEADING,
      automaticSessionId: automaticId,
      sessions: sessions.map((s) => ({
        id: s.productId,
        title: s.shortName?.trim() || s.product.title,
        startsAt: s.startsAt,
        status: s.product.status,
        testimonialCount: s._count.testimonials,
      })),
    };
  }

  async update(input: NoSessionTestimonialsInput, actor: Actor) {
    const before = await this.forAdmin();
    if (input.sessionId) {
      const exists = before.sessions.some((s) => s.id === input.sessionId);
      if (!exists) throw new BadRequestException('That session has no testimonials to show.');
    }
    // A cleared field goes back to the default text.
    const text = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);

    await this.row();
    await this.prisma.platformSettings.update({
      where: { id: SINGLETON_ID },
      data: {
        noSessionTestimonialsEnabled: input.enabled,
        noSessionTestimonialsSessionId: input.sessionId,
        noSessionTestimonialsHeading: text(input.heading),
        noSessionTestimonialsSubheading: text(input.subheading),
      },
    });

    const after = await this.forAdmin();
    await this.audit.record({
      actorUserId: actor.id,
      action: 'platform_settings.no_session_testimonials_updated',
      entityType: 'platform_settings',
      entityId: SINGLETON_ID,
      before: { enabled: before.enabled, sessionId: before.sessionId, heading: before.heading, subheading: before.subheading },
      after: { enabled: after.enabled, sessionId: after.sessionId, heading: after.heading, subheading: after.subheading },
      ip: actor.ip,
    });
    return after;
  }

  // --- internals ----------------------------------------------------------------

  /** Upserts so a missing row heals itself, as SettingsService does. */
  private row() {
    return this.prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
  }

  /**
   * The most recent published session that has begun and has screenshots in
   * its original gallery. The payment test session is never it, as on the
   * landing page.
   */
  private async latestWithTestimonials(): Promise<string | null> {
    const testSlug = this.config.get('PAYMENT_TEST_SESSION_SLUG');
    const session = await this.prisma.liveSession.findFirst({
      where: {
        startsAt: { lte: new Date() },
        testimonials: { some: ORIGINAL_GALLERY },
        product: {
          status: ProductStatus.PUBLISHED,
          deletedAt: null,
          ...(testSlug ? { slug: { not: testSlug } } : {}),
        },
      },
      orderBy: { startsAt: 'desc' },
      select: { productId: true },
    });
    return session?.productId ?? null;
  }
}
