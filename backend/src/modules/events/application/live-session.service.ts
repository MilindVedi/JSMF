import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessType,
  EntitlementStatus,
  Prisma,
  ProductStatus,
  ProductType,
} from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ProductService, type Actor } from '../../catalog/application/product.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import { OrderService, type CheckoutResult } from '../../orders/application/order.service';

export interface LiveSessionInput {
  title?: string;
  slug?: string;
  tagline?: string;
  description?: string;
  startsAt?: string;
  durationMinutes?: number;
  platformLabel?: string;
  capacity?: number | null;
  priceAmountMinor?: string;
  compareAtAmountMinor?: string | null;
  joinUrl?: string | null;
  recordingUrl?: string | null;
  highlights?: string[];
  perkText?: string | null;
  includedProductIds?: string[];
}

export interface RegistrationAnswers {
  whatsappNumber: string;
  exam: string;
  stage: string;
}

const SESSION_INCLUDE = {
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
 * Live sessions: the one thing the main website sells today.
 *
 * Everything that is merely "a product being bought" is delegated — the
 * product row and its rules to ProductService, payment to OrderService — so
 * this service holds only what is genuinely about a session: when it is,
 * whether seats are left, and what the attendee told us.
 */
@Injectable()
export class LiveSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductService,
    private readonly orders: OrderService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  // --- public ---------------------------------------------------------------

  /**
   * What the landing page shows: the next session, and the most recent past
   * one (for its recording) when there is nothing upcoming.
   *
   * "Upcoming" ends at the start time, which is also when registration closes:
   * a seat bought after the session began is a seat for something mostly over.
   */
  async landing() {
    const now = new Date();
    const visible = { product: { status: ProductStatus.PUBLISHED, deletedAt: null } };

    const [upcoming, previous] = await Promise.all([
      this.prisma.liveSession.findFirst({
        where: { ...visible, startsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        include: SESSION_INCLUDE,
      }),
      this.prisma.liveSession.findFirst({
        where: { ...visible, startsAt: { lte: now } },
        orderBy: { startsAt: 'desc' },
        include: SESSION_INCLUDE,
      }),
    ]);

    const taken = await this.seatsTaken(
      [upcoming, previous].filter((s): s is SessionRow => s !== null).map((s) => s.productId),
    );

    return {
      upcoming: upcoming ? this.toPublic(upcoming, taken.get(upcoming.productId) ?? 0) : null,
      previous: previous ? this.toPublic(previous, taken.get(previous.productId) ?? 0) : null,
    };
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
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // The free planner is granted to this account and the confirmation is
    // emailed, so an account with no email (mobile sign-in) cannot register.
    if (!user?.email) {
      throw new BadRequestException(
        'Sign in with your Google account to register. The free PDF is added to that account.',
      );
    }

    const session = await this.prisma.liveSession.findFirst({
      where: {
        productId: sessionId,
        product: { status: ProductStatus.PUBLISHED, deletedAt: null },
      },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (session.startsAt.getTime() <= Date.now()) {
      throw new ConflictException('Registration for this session has closed.');
    }

    if (await this.entitlements.findActive(userId, sessionId)) {
      throw new ConflictException('You already have a seat for this session.');
    }

    if (session.capacity !== null) {
      const taken = (await this.seatsTaken([sessionId])).get(sessionId) ?? 0;
      if (taken >= session.capacity) throw new ConflictException('This session is full.');
    }

    const whatsappNumber = normalisePhone(answers.whatsappNumber);

    const registration = await this.prisma.sessionRegistration.upsert({
      where: { liveSessionId_userId: { liveSessionId: sessionId, userId } },
      create: {
        liveSessionId: sessionId,
        userId,
        whatsappNumber,
        exam: answers.exam,
        stage: answers.stage,
      },
      update: { whatsappNumber, exam: answers.exam, stage: answers.stage },
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
    return sessions.map((s) => this.toAdmin(s, taken.get(s.productId) ?? 0));
  }

  async getForAdmin(id: string) {
    const session = await this.getRowOrThrow(id);
    const taken = await this.seatsTaken([id]);
    return this.toAdmin(session, taken.get(id) ?? 0);
  }

  async create(input: LiveSessionInput, actor: Actor) {
    const required = ['title', 'tagline', 'startsAt', 'durationMinutes', 'platformLabel', 'priceAmountMinor'] as const;
    for (const field of required) {
      if (input[field] === undefined) throw new BadRequestException(`${field} is required`);
    }

    const startsAt = new Date(input.startsAt!);
    if (startsAt.getTime() <= Date.now()) {
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
            startsAt,
            durationMinutes: input.durationMinutes!,
            platformLabel: input.platformLabel!,
            capacity: input.capacity ?? null,
            joinUrl: blankToNull(input.joinUrl) ?? null,
            recordingUrl: blankToNull(input.recordingUrl) ?? null,
            highlights: input.highlights ?? [],
            perkText: blankToNull(input.perkText) ?? null,
          },
        });

        await this.replaceIncluded(tx, created.id, included);

        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'live_session.created',
            entityType: 'live_session',
            entityId: created.id,
            after: { ...session, includedProductIds: included },
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
        const after = await tx.liveSession.update({
          where: { productId: id },
          data: {
            startsAt: input.startsAt === undefined ? undefined : new Date(input.startsAt),
            durationMinutes: input.durationMinutes,
            platformLabel: input.platformLabel,
            capacity: input.capacity,
            joinUrl: blankToNull(input.joinUrl),
            recordingUrl: blankToNull(input.recordingUrl),
            highlights: input.highlights,
            perkText: blankToNull(input.perkText),
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
            after: included ? { ...after, includedProductIds: included } : after,
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
      reminderSentAt: row.reminderSentAt,
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

  private toPublic(session: SessionRow, taken: number) {
    const { product } = session;
    const started = session.startsAt.getTime() <= Date.now();
    const seatsRemaining = session.capacity === null ? null : Math.max(0, session.capacity - taken);

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      tagline: product.subtitle,
      description: product.description,
      startsAt: session.startsAt,
      durationMinutes: session.durationMinutes,
      platformLabel: session.platformLabel,
      highlights: session.highlights,
      perkText: session.perkText,
      priceAmountMinor: product.priceAmountMinor,
      compareAtAmountMinor: product.compareAtAmountMinor,
      currency: product.currency,
      capacity: session.capacity,
      seatsRemaining,
      registrationOpen: !started && (seatsRemaining === null || seatsRemaining > 0),
      // The joining link is never here. It goes only to seat holders, by email.
      recordingUrl: started ? session.recordingUrl : null,
      included: product.bundleItems.map((item) => ({ title: item.child.title })),
    };
  }

  private toAdmin(session: SessionRow, taken: number) {
    const { product } = session;

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      tagline: product.subtitle,
      description: product.description,
      status: product.status,
      startsAt: session.startsAt,
      durationMinutes: session.durationMinutes,
      platformLabel: session.platformLabel,
      capacity: session.capacity,
      seatsTaken: taken,
      joinUrl: session.joinUrl,
      recordingUrl: session.recordingUrl,
      highlights: session.highlights,
      perkText: session.perkText,
      priceAmountMinor: product.priceAmountMinor,
      compareAtAmountMinor: product.compareAtAmountMinor,
      currency: product.currency,
      included: product.bundleItems.map((item) => item.child),
      updatedAt: session.updatedAt,
    };
  }
}
