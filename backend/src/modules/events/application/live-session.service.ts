import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { activity } from '../../../shared/logging/activity';
import {
  AccessType,
  BundleDeliveryMode,
  EntitlementStatus,
  Prisma,
  ProductStatus,
  ProductType,
} from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ProductService, type Actor } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OrderService, type CheckoutResult } from '../../orders/application/order.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';

export interface LiveSessionInput {
  title?: string;
  slug?: string;
  tagline?: string;
  description?: string;
  days?: SessionDayInput[];
  platformLabel?: string;
  capacity?: number | null;
  showSeats?: boolean;
  displaySeats?: number | null;
  bundleDeliveryMode?: BundleDeliveryMode;
  priceAmountMinor?: string;
  compareAtAmountMinor?: string | null;
  joinUrl?: string | null;
  recordingUrl?: string | null;
  highlights?: string[];
  perkText?: string | null;
  audienceText?: string | null;
  testimonialsHeading?: string | null;
  testimonialsSubheading?: string | null;
  testimonialsTag?: string | null;
  confirmationSubject?: string | null;
  pendingJoinLinkText?: string | null;
  showNotSpamNotice?: boolean;
  includedProductIds?: string[];
}

export interface SessionDayInput {
  /** Present when editing a day that already exists. */
  id?: string;
  startsAt: string;
  durationMinutes: number;
}

interface NormalisedDay {
  id?: string;
  startsAt: Date;
  durationMinutes: number;
}

export interface RegistrationAnswers {
  /** No longer collected; present only when an older page still sends one. */
  whatsappNumber?: string;
  exam: string;
  stage: string;
}

const SESSION_INCLUDE = {
  days: { orderBy: { startsAt: 'asc' } },
  testimonials: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  product: {
    include: {
      bundleItems: {
        where: { child: { deletedAt: null } },
        orderBy: { sortOrder: 'asc' },
        include: { child: { select: { id: true, title: true, slug: true, status: true } } },
      },
    },
  },
} satisfies Prisma.LiveSessionInclude;

type SessionRow = Prisma.LiveSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

/** "" from a cleared form field means "remove it", the same as null. */
function blankToNull(value: string | null | undefined): string | null | undefined {
  return value === '' ? null : value;
}

/**
 * Digits with country code, the way every other number here is stored. A bare
 * ten-digit Indian number gets 91 in front; anything else is kept as typed
 * once the spaces, dashes and + are gone.
 */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/**
 * Days in start order, refusing any two that overlap (which also refuses two
 * at the same time). The order the admin typed them in does not matter.
 */
function normaliseDays(days: SessionDayInput[]): NormalisedDay[] {
  const sorted = days
    .map((day) => ({ id: day.id, startsAt: new Date(day.startsAt), durationMinutes: day.durationMinutes }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (let i = 1; i < sorted.length; i++) {
    const previousEnd = sorted[i - 1].startsAt.getTime() + sorted[i - 1].durationMinutes * 60_000;
    if (sorted[i].startsAt.getTime() < previousEnd) {
      throw new BadRequestException(`Day ${i + 1} starts before day ${i} has finished.`);
    }
  }

  const ids = sorted.map((d) => d.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new BadRequestException('The same day was sent twice.');

  return sorted;
}

/**
 * Live sessions: the one thing the main website sells today.
 *
 * Everything that is merely "a product being bought" is delegated — the
 * product row and its rules to ProductService, payment to OrderService — so
 * this service holds only what is genuinely about a session: when it is,
 * whether seats are left, and what the attendee told us.
 */
@Injectable()
export class LiveSessionService {
  private readonly logger = new Logger(LiveSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductService,
    private readonly orders: OrderService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Testimonial screenshots as URLs the browser can load. They live in the
   * public bucket like a cover image, so this is a CDN address on Cloudinary;
   * the local driver has no public surface and signs them instead.
   */
  private testimonialUrls(session: SessionRow): Promise<string[]> {
    return Promise.all(
      session.testimonials.map((row) =>
        this.storage.getSignedDownloadUrl(objectRefOf(row), { disposition: 'inline' }),
      ),
    );
  }

  // --- public ---------------------------------------------------------------

  /**
   * What the landing page shows: the next session, and the most recent past
   * one (for its recording) when there is nothing upcoming.
   *
   * "Upcoming" ends when the first day starts, which is also when registration
   * closes: a seat bought after the session began is a seat for something
   * partly over.
   */
  async landing() {
    const now = new Date();
    const testSlug = this.config.get('PAYMENT_TEST_SESSION_SLUG');
    const visible = {
      product: {
        status: ProductStatus.PUBLISHED,
        deletedAt: null,
        ...(testSlug ? { slug: { not: testSlug } } : {}),
      },
    };

    const [upcoming, previous] = await Promise.all([
      this.prisma.liveSession.findFirst({
        // A session with no dates yet counts as upcoming: it has not happened,
        // and it is on sale. `nulls: 'last'` keeps it behind anything actually
        // scheduled, so announcing a dated session does not bury it.
        where: { ...visible, OR: [{ startsAt: null }, { startsAt: { gt: now } }] },
        orderBy: { startsAt: { sort: 'asc', nulls: 'last' } },
        include: SESSION_INCLUDE,
      }),
      this.prisma.liveSession.findFirst({
        // `lte` excludes NULL on its own, so an undated session is never the
        // "previous" one — nothing has finished.
        where: { ...visible, startsAt: { lte: now } },
        orderBy: { startsAt: 'desc' },
        include: SESSION_INCLUDE,
      }),
    ]);

    const taken = await this.seatsTaken(
      [upcoming, previous].filter((s): s is SessionRow => s !== null).map((s) => s.productId),
    );

    return {
      upcoming: upcoming ? await this.toPublic(upcoming, taken.get(upcoming.productId) ?? 0) : null,
      previous: previous ? await this.toPublic(previous, taken.get(previous.productId) ?? 0) : null,
    };
  }

  /** The session behind /testapayment, or 404 when none is configured. */
  paymentTestSession() {
    const slug = this.config.get('PAYMENT_TEST_SESSION_SLUG');
    if (!slug) throw new NotFoundException('No payment test session is configured');
    return this.publicBySlug(slug);
  }

  async publicBySlug(slug: string) {
    const session = await this.prisma.liveSession.findFirst({
      where: { product: { slug, status: ProductStatus.PUBLISHED, deletedAt: null } },
      include: SESSION_INCLUDE,
    });

    if (!session) throw new NotFoundException('Session not found');

    const taken = await this.seatsTaken([session.productId]);
    return this.toPublic(session, taken.get(session.productId) ?? 0);
  }

  /** Whether the signed-in person already holds a seat — drives the button. */
  async registrationFor(userId: string, sessionId: string) {
    const [seat, registration] = await Promise.all([
      this.entitlements.findActive(userId, sessionId),
      this.prisma.sessionRegistration.findUnique({
        where: { liveSessionId_userId: { liveSessionId: sessionId, userId } },
        select: { whatsappNumber: true, exam: true, stage: true },
      }),
    ]);

    return { registered: seat !== null, answers: registration };
  }

  /**
   * Records the attendee's answers and starts the Razorpay checkout.
   *
   * The answers are saved before payment, deliberately: someone who abandons
   * the widget and comes back should not retype them. Whether they actually
   * hold a seat is never read from this row — only from an active entitlement,
   * which exists only once the payment settles.
   *
   * Seats are checked here, at checkout, and not held while the payment is
   * pending. Two people can therefore both pay for the last seat; both keep
   * it. Refusing a payment that already cleared would be far worse than a
   * session with one person over its nominal capacity.
   */
  async register(userId: string, sessionId: string, answers: RegistrationAnswers): Promise<CheckoutResult> {
    // Every refusal is logged with the reason, so "I clicked Book My Spot and
    // it didn't work" is answerable from the logs for that userId.
    // Explicitly typed so calls to it narrow like a `throw` would.
    const refuse: (reason: string, error: Error) => never = (reason, error) => {
      activity(this.logger, 'session.registration_refused', { userId, sessionId, reason }, 'warn');
      throw error;
    };

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // The free planner is granted to this account and the confirmation is
    // emailed, so an account with no email (mobile sign-in) cannot register.
    if (!user?.email) {
      refuse(
        'account has no email',
        new BadRequestException(
          'Sign in with your Google account to register. The free PDF is added to that account.',
        ),
      );
    }

    const session = await this.prisma.liveSession.findFirst({
      where: {
        productId: sessionId,
        product: { status: ProductStatus.PUBLISHED, deletedAt: null },
      },
    });

    if (!session) return refuse('session not found or unpublished', new NotFoundException('Session not found'));

    // No date yet means nothing has started, so registration stays open.
    if (session.startsAt !== null && session.startsAt.getTime() <= Date.now()) {
      refuse('session already started', new ConflictException('Registration for this session has closed.'));
    }

    if (await this.entitlements.findActive(userId, sessionId)) {
      refuse('already holds a seat', new ConflictException('You already have a seat for this session.'));
    }

    if (session.capacity !== null) {
      const taken = (await this.seatsTaken([sessionId])).get(sessionId) ?? 0;
      if (taken >= session.capacity) refuse('session full', new ConflictException('This session is full.'));
    }

    // The 10-digit mobile number the form asks for, stored with its country code.
    const whatsappNumber = answers.whatsappNumber ? normalisePhone(answers.whatsappNumber) : null;

    const registration = await this.prisma.sessionRegistration.upsert({
      where: { liveSessionId_userId: { liveSessionId: sessionId, userId } },
      create: {
        liveSessionId: sessionId,
        userId,
        whatsappNumber,
        exam: answers.exam,
        stage: answers.stage,
      },
      // A number already on record is kept rather than wiped by a form that no
      // longer collects one.
      update: {
        ...(whatsappNumber ? { whatsappNumber } : {}),
        exam: answers.exam,
        stage: answers.stage,
      },
    });

    const result = await this.orders.checkout({
      userId,
      productId: sessionId,
      customerEmail: user.email,
      customerPhone: whatsappNumber,
      allowedTypes: [ProductType.LIVE_SESSION],
    });

    await this.prisma.sessionRegistration.update({
      where: { id: registration.id },
      data: { orderId: result.orderId },
    });

    activity(this.logger, 'session.registration_started', {
      userId,
      sessionId,
      registrationId: registration.id,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      kind: result.kind,
      exam: answers.exam,
      stage: answers.stage,
      hasMobile: Boolean(whatsappNumber),
    });

    return result;
  }

  // --- admin ----------------------------------------------------------------

  async listForAdmin() {
    const sessions = await this.prisma.liveSession.findMany({
      where: { product: { deletedAt: null } },
      orderBy: { startsAt: 'desc' },
      include: SESSION_INCLUDE,
    });

    const taken = await this.seatsTaken(sessions.map((s) => s.productId));
    return Promise.all(sessions.map((s) => this.toAdmin(s, taken.get(s.productId) ?? 0)));
  }

  async getForAdmin(id: string) {
    const session = await this.getRowOrThrow(id);
    const taken = await this.seatsTaken([id]);
    return this.toAdmin(session, taken.get(id) ?? 0);
  }

  async create(input: LiveSessionInput, actor: Actor) {
    const required = ['title', 'tagline', 'days', 'platformLabel', 'priceAmountMinor'] as const;
    for (const field of required) {
      if (input[field] === undefined) throw new BadRequestException(`${field} is required`);
    }

    const days = normaliseDays(input.days!);
    if (days.some((day) => day.id)) throw new BadRequestException('A new session cannot have existing days.');
    // An empty list is "dates not fixed yet", which is allowed. Only a date
    // that has been given can be wrong.
    if (days.length > 0 && days[0].startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('A new session must start in the future.');
    }

    const included = await this.validateIncluded(input.includedProductIds ?? []);

    const product = await this.products.create(
      {
        type: ProductType.LIVE_SESSION,
        title: input.title!,
        slug: input.slug,
        subtitle: input.tagline,
        description: input.description,
        // Always paid: resolvePricing refuses a PAID product at ₹0.
        accessType: AccessType.PAID,
        priceAmountMinor: input.priceAmountMinor,
        compareAtAmountMinor: input.compareAtAmountMinor ?? null,
      },
      actor,
      async (tx, created) => {
        const session = await tx.liveSession.create({
          data: {
            productId: created.id,
            startsAt: days[0]?.startsAt ?? null,
            platformLabel: input.platformLabel!,
            capacity: input.capacity ?? null,
            showSeats: input.showSeats ?? true,
            displaySeats: input.displaySeats ?? null,
            bundleDeliveryMode: input.bundleDeliveryMode ?? BundleDeliveryMode.IMMEDIATE,
            joinUrl: blankToNull(input.joinUrl) ?? null,
            recordingUrl: blankToNull(input.recordingUrl) ?? null,
            highlights: input.highlights ?? [],
            perkText: blankToNull(input.perkText) ?? null,
            audienceText: blankToNull(input.audienceText) ?? null,
            testimonialsHeading: blankToNull(input.testimonialsHeading) ?? null,
            testimonialsSubheading: blankToNull(input.testimonialsSubheading) ?? null,
            testimonialsTag: blankToNull(input.testimonialsTag) ?? null,
            confirmationSubject: blankToNull(input.confirmationSubject) ?? null,
            pendingJoinLinkText: blankToNull(input.pendingJoinLinkText) ?? null,
            showNotSpamNotice: input.showNotSpamNotice ?? false,
          },
        });

        await tx.liveSessionDay.createMany({
          data: days.map((day) => ({
            liveSessionId: created.id,
            startsAt: day.startsAt,
            durationMinutes: day.durationMinutes,
          })),
        });

        await this.replaceIncluded(tx, created.id, included);

        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'live_session.created',
            entityType: 'live_session',
            entityId: created.id,
            after: { ...session, days, includedProductIds: included },
            ip: actor.ip,
          },
          tx,
        );
      },
    );

    return this.getForAdmin(product.id);
  }

  async update(id: string, input: LiveSessionInput, actor: Actor) {
    const before = await this.getRowOrThrow(id);
    const included =
      input.includedProductIds === undefined ? undefined : await this.validateIncluded(input.includedProductIds);
    const days = input.days === undefined ? undefined : normaliseDays(input.days);

    if (days) {
      const known = new Set(before.days.map((d) => d.id));
      if (days.some((day) => day.id && !known.has(day.id))) {
        throw new BadRequestException('A day does not belong to this session.');
      }
    }

    await this.products.update(
      id,
      {
        title: input.title,
        slug: input.slug,
        subtitle: input.tagline,
        description: input.description,
        priceAmountMinor: input.priceAmountMinor,
        compareAtAmountMinor: input.compareAtAmountMinor,
      },
      actor,
      async (tx) => {
        if (days) await this.replaceDays(tx, id, before.days, days);

        const after = await tx.liveSession.update({
          where: { productId: id },
          data: {
            // `undefined` leaves it alone; an empty day list clears it, which
            // is how a session goes back to "dates to be announced".
            startsAt: days === undefined ? undefined : (days[0]?.startsAt ?? null),
            platformLabel: input.platformLabel,
            capacity: input.capacity,
            showSeats: input.showSeats,
            displaySeats: input.displaySeats,
            bundleDeliveryMode: input.bundleDeliveryMode,
            joinUrl: blankToNull(input.joinUrl),
            recordingUrl: blankToNull(input.recordingUrl),
            highlights: input.highlights,
            perkText: blankToNull(input.perkText),
            audienceText: blankToNull(input.audienceText),
            testimonialsHeading: blankToNull(input.testimonialsHeading),
            testimonialsSubheading: blankToNull(input.testimonialsSubheading),
            testimonialsTag: blankToNull(input.testimonialsTag),
            confirmationSubject: blankToNull(input.confirmationSubject),
            pendingJoinLinkText: blankToNull(input.pendingJoinLinkText),
            showNotSpamNotice: input.showNotSpamNotice,
          },
        });

        if (included) await this.replaceIncluded(tx, id, included);

        const { product: _product, ...beforeRow } = before;
        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'live_session.updated',
            entityType: 'live_session',
            entityId: id,
            before: beforeRow,
            after: { ...after, ...(days && { days }), ...(included && { includedProductIds: included }) },
            ip: actor.ip,
          },
          tx,
        );
      },
    );

    return this.getForAdmin(id);
  }

  async publish(id: string, actor: Actor) {
    await this.getRowOrThrow(id);
    await this.products.publish(id, actor);
    return this.getForAdmin(id);
  }

  async unpublish(id: string, actor: Actor) {
    await this.getRowOrThrow(id);
    await this.products.unpublish(id, actor);
    return this.getForAdmin(id);
  }

  /**
   * Soft delete, like every product. Seats already sold stay valid and
   * refundable; the session simply stops being shown.
   */
  async archive(id: string, actor: Actor) {
    await this.getRowOrThrow(id);
    await this.products.archive(id, actor);
  }

  /** Everyone who started registering, with whether they actually hold a seat. */
  async registrationsForAdmin(id: string) {
    await this.getRowOrThrow(id);

    const rows = await this.prisma.sessionRegistration.findMany({
      where: { liveSessionId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { select: { orderNumber: true, status: true } },
        dayReminders: { select: { sentAt: true }, orderBy: { sentAt: 'desc' } },
      },
    });

    const seats = await this.prisma.entitlement.findMany({
      where: { productId: id, status: EntitlementStatus.ACTIVE, userId: { in: rows.map((r) => r.userId) } },
      select: { userId: true },
    });
    const seated = new Set(seats.map((s) => s.userId));

    return rows.map((row) => ({
      id: row.id,
      user: row.user,
      whatsappNumber: row.whatsappNumber,
      exam: row.exam,
      stage: row.stage,
      paid: seated.has(row.userId),
      order: row.order,
      confirmationSentAt: row.confirmationSentAt,
      /** Days this person has been reminded about, and when the latest went. */
      remindersSent: row.dayReminders.length,
      lastReminderSentAt: row.dayReminders[0]?.sentAt ?? null,
      createdAt: row.createdAt,
    }));
  }

  // --- internals ------------------------------------------------------------

  /** Seats taken = active entitlements. Counted, never stored, so a refund frees one by itself. */
  private async seatsTaken(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const groups = await this.prisma.entitlement.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, status: EntitlementStatus.ACTIVE },
      _count: { _all: true },
    });

    return new Map(groups.map((g) => [g.productId, g._count._all]));
  }

  private async getRowOrThrow(id: string): Promise<SessionRow> {
    const session = await this.prisma.liveSession.findFirst({
      where: { productId: id, product: { deletedAt: null } },
      include: SESSION_INCLUDE,
    });

    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /** Only real, un-archived PDFs (or other catalogue products) can come with a seat. */
  private async validateIncluded(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return unique;

    const found = await this.prisma.product.count({
      where: { id: { in: unique }, deletedAt: null, type: { not: ProductType.LIVE_SESSION } },
    });

    if (found !== unique.length) {
      throw new BadRequestException('An included product does not exist or cannot be included.');
    }

    return unique;
  }

  /**
   * Replaces what comes with a seat. Future buyers get the new set; people who
   * already paid keep what they were granted — entitlements are never
   * rewritten after the fact.
   */
  private async replaceIncluded(tx: Prisma.TransactionClient, sessionId: string, ids: string[]) {
    await tx.productBundleItem.deleteMany({ where: { bundleProductId: sessionId } });

    if (ids.length > 0) {
      await tx.productBundleItem.createMany({
        data: ids.map((childProductId, sortOrder) => ({
          bundleProductId: sessionId,
          childProductId,
          sortOrder,
        })),
      });
    }
  }

  /**
   * Makes the session's days match the list sent, keeping each existing day's
   * row (matched by id) so its reminder history survives an unrelated edit.
   *
   * A day whose start moves has its reminders cleared: the reminder already
   * sent was for a time that is no longer true, so it should go out again for
   * the new one. A removed day has its reminders removed first — deliberately,
   * here, rather than by a cascade.
   */
  private async replaceDays(
    tx: Prisma.TransactionClient,
    sessionId: string,
    existing: Array<{ id: string; startsAt: Date }>,
    days: NormalisedDay[],
  ) {
    const kept = new Set(days.map((d) => d.id).filter(Boolean));
    const removed = existing.filter((d) => !kept.has(d.id)).map((d) => d.id);

    if (removed.length > 0) {
      await tx.sessionDayReminder.deleteMany({ where: { liveSessionDayId: { in: removed } } });
      await tx.liveSessionDay.deleteMany({ where: { id: { in: removed } } });
    }

    for (const day of days) {
      if (!day.id) {
        await tx.liveSessionDay.create({
          data: { liveSessionId: sessionId, startsAt: day.startsAt, durationMinutes: day.durationMinutes },
        });
        continue;
      }

      const current = existing.find((d) => d.id === day.id)!;
      if (current.startsAt.getTime() !== day.startsAt.getTime()) {
        await tx.sessionDayReminder.deleteMany({ where: { liveSessionDayId: day.id } });
      }
      await tx.liveSessionDay.update({
        where: { id: day.id },
        data: { startsAt: day.startsAt, durationMinutes: day.durationMinutes },
      });
    }
  }

  // --- testimonials ---------------------------------------------------------

  /**
   * Adds a screenshot of what someone said about a past session.
   *
   * Public-bucket, like a cover image: this is marketing shown to people who
   * have not paid and must not need a signed URL to load. New ones go to the
   * end, so the admin's upload order is the display order.
   */
  async addTestimonial(
    sessionId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    actor: Actor,
  ) {
    await this.getRowOrThrow(sessionId);

    if (!/^image\/(png|jpeg|webp)$/.test(file.mimetype)) {
      throw new BadRequestException('A testimonial must be a PNG, JPEG or WebP image.');
    }

    const stored = await this.storage.upload({
      content: file.buffer,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      visibility: 'PUBLIC',
      keyPrefix: `sessions/${sessionId}/testimonials`,
    });

    const last = await this.prisma.sessionTestimonial.findFirst({
      where: { liveSessionId: sessionId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const row = await this.prisma.sessionTestimonial.create({
      data: {
        liveSessionId: sessionId,
        storageProvider: stored.provider,
        bucket: stored.bucket,
        objectKey: stored.objectKey,
        mimeType: stored.mimeType,
        sizeBytes: BigInt(stored.sizeBytes),
        sortOrder: (last?.sortOrder ?? -1) + 1,
        uploadedById: actor.id,
      },
    });

    return {
      id: row.id,
      url: await this.storage.getSignedDownloadUrl(objectRefOf(row), { disposition: 'inline' }),
      sortOrder: row.sortOrder,
    };
  }

  /**
   * Removes one. The stored file goes too — a testimonial pulled from a page
   * is meant to be gone, not merely unlinked and still fetchable by anyone who
   * noted the URL.
   */
  async removeTestimonial(sessionId: string, testimonialId: string) {
    const row = await this.prisma.sessionTestimonial.findFirst({
      where: { id: testimonialId, liveSessionId: sessionId },
    });

    if (!row) throw new NotFoundException('Testimonial not found');

    await this.prisma.sessionTestimonial.delete({ where: { id: row.id } });

    try {
      await this.storage.delete(objectRefOf(row));
    } catch {
      // The row is gone, so the page is correct. An orphaned object is a
      // storage-cleanup problem, not a reason to fail the admin's action.
    }
  }

  /**
   * Sets the display order from the admin's drag-and-drop, in one go.
   *
   * `testimonialIds` must name exactly this session's testimonials, once each
   * — anything else (a stale id from another session, a missing one, a
   * duplicate) is rejected rather than silently reordering a subset, since a
   * partial reorder would leave the list in an order nobody asked for.
   */
  async reorderTestimonials(sessionId: string, testimonialIds: string[]) {
    const rows = await this.prisma.sessionTestimonial.findMany({
      where: { liveSessionId: sessionId },
      select: { id: true },
    });

    const current = new Set(rows.map((row) => row.id));
    const next = new Set(testimonialIds);
    if (testimonialIds.length !== rows.length || current.size !== next.size || [...next].some((id) => !current.has(id))) {
      throw new BadRequestException('testimonialIds must list exactly this session\'s testimonials, once each.');
    }

    await this.prisma.$transaction(
      testimonialIds.map((id, sortOrder) =>
        this.prisma.sessionTestimonial.update({ where: { id }, data: { sortOrder } }),
      ),
    );
  }

  private async toPublic(session: SessionRow, taken: number) {
    const { product } = session;
    // Dates not fixed yet: nothing has started, so registration is open and
    // there is no recording to show.
    const started = session.startsAt !== null && session.startsAt.getTime() <= Date.now();
    const seatsRemaining = session.capacity === null ? null : Math.max(0, session.capacity - taken);

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      tagline: product.subtitle,
      description: product.description,
      startsAt: session.startsAt,
      days: session.days.map((day) => ({ startsAt: day.startsAt, durationMinutes: day.durationMinutes })),
      platformLabel: session.platformLabel,
      highlights: session.highlights,
      perkText: session.perkText,
      audienceText: session.audienceText,
      testimonialsHeading: session.testimonialsHeading,
      testimonialsSubheading: session.testimonialsSubheading,
      testimonialsTag: session.testimonialsTag,
      testimonialUrls: await this.testimonialUrls(session),
      priceAmountMinor: product.priceAmountMinor,
      compareAtAmountMinor: product.compareAtAmountMinor,
      currency: product.currency,
      capacity: session.capacity,
      displaySeats: session.showSeats ? session.displaySeats : null,
      seatsRemaining: session.showSeats ? seatsRemaining : null,
      registrationOpen: !started && (seatsRemaining === null || seatsRemaining > 0),
      // The joining link is never here. It goes only to seat holders, by email.
      recordingUrl: started ? session.recordingUrl : null,
      included: product.bundleItems.map((item) => ({ title: item.child.title })),
    };
  }

  private async toAdmin(session: SessionRow, taken: number) {
    const { product } = session;

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      tagline: product.subtitle,
      description: product.description,
      status: product.status,
      startsAt: session.startsAt,
      days: session.days.map((day) => ({ id: day.id, startsAt: day.startsAt, durationMinutes: day.durationMinutes })),
      platformLabel: session.platformLabel,
      capacity: session.capacity,
      showSeats: session.showSeats,
      displaySeats: session.displaySeats,
      bundleDeliveryMode: session.bundleDeliveryMode,
      seatsTaken: taken,
      joinUrl: session.joinUrl,
      recordingUrl: session.recordingUrl,
      highlights: session.highlights,
      perkText: session.perkText,
      audienceText: session.audienceText,
      testimonialsHeading: session.testimonialsHeading,
      testimonialsSubheading: session.testimonialsSubheading,
      testimonialsTag: session.testimonialsTag,
      confirmationSubject: session.confirmationSubject,
      pendingJoinLinkText: session.pendingJoinLinkText,
      showNotSpamNotice: session.showNotSpamNotice,
      testimonials: await Promise.all(
        session.testimonials.map(async (row) => ({
          id: row.id,
          url: await this.storage.getSignedDownloadUrl(objectRefOf(row), { disposition: 'inline' }),
          sortOrder: row.sortOrder,
        })),
      ),
      priceAmountMinor: product.priceAmountMinor,
      compareAtAmountMinor: product.compareAtAmountMinor,
      currency: product.currency,
      included: product.bundleItems.map((item) => item.child),
      updatedAt: session.updatedAt,
    };
  }
}
