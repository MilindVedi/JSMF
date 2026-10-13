import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccessType,
  MentorshipBookingStatus,
  MentorshipExceptionKind,
  Prisma,
  ProductStatus,
  ProductType,
} from '@prisma/client';
import { DateTime, IANAZone } from 'luxon';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ProductService, type Actor } from '../../catalog/application/product.service';

/** The smallest price a call may have: a one-to-one call is always paid. */
const MIN_PRICE_MINOR = 100n;
const MAX_RULES = 50;

export interface OfferingInput {
  title?: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  priceAmountMinor?: string;
  compareAtAmountMinor?: string | null;
  durationMinutes?: number;
  bufferMinutes?: number;
  timezone?: string;
  minNoticeMinutes?: number;
  bookingWindowDays?: number;
  rescheduleCutoffMinutes?: number;
  maxReschedules?: number;
  platformLabel?: string;
  highlights?: string[];
}

export interface RuleInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface ExceptionInput {
  /** `YYYY-MM-DD`, a date in the offering's timezone. */
  date: string;
  kind: MentorshipExceptionKind;
  startMinute?: number | null;
  endMinute?: number | null;
  note?: string | null;
}

const OFFERING_INCLUDE = {
  product: true,
  rules: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
} satisfies Prisma.MentorshipOfferingInclude;

type OfferingRow = Prisma.MentorshipOfferingGetPayload<{ include: typeof OFFERING_INCLUDE }>;

/**
 * A one-to-one call as something that can be sold: its product (title, price,
 * status), its rules, and its weekly hours and dated exceptions.
 *
 * The product is written through ProductService, so pricing rules, slugs and
 * the audit trail are the catalogue's own; the offering row is written in the
 * same transaction, so neither can exist without the other.
 */
@Injectable()
export class MentorshipOfferingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductService,
    private readonly audit: AuditService,
  ) {}

  // --- public ---------------------------------------------------------------

  /** Every published offering, oldest first — the first is the one the home page shows. */
  async listPublished() {
    const rows = await this.prisma.mentorshipOffering.findMany({
      where: { product: { status: ProductStatus.PUBLISHED, deletedAt: null } },
      include: OFFERING_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toPublic(row));
  }

  async publicBySlug(slug: string) {
    return this.toPublic(await this.publishedBySlugOrThrow(slug));
  }

  /** The published offering behind a slug, or 404 — never a draft or archived one. */
  async publishedBySlugOrThrow(slug: string): Promise<OfferingRow> {
    const row = await this.prisma.mentorshipOffering.findFirst({
      where: { product: { slug, status: ProductStatus.PUBLISHED, deletedAt: null } },
      include: OFFERING_INCLUDE,
    });
    if (!row) throw new NotFoundException('This mentorship offering is not available.');
    return row;
  }

  // --- admin ----------------------------------------------------------------

  async listForAdmin() {
    const rows = await this.prisma.mentorshipOffering.findMany({
      where: { product: { deletedAt: null } },
      include: OFFERING_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(rows.map((row) => this.toAdmin(row)));
  }

  async getForAdmin(id: string) {
    return this.toAdmin(await this.getRowOrThrow(id));
  }

  async create(input: OfferingInput, actor: Actor) {
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (input.priceAmountMinor === undefined) throw new BadRequestException('priceAmountMinor is required');
    this.validate(input);

    const product = await this.products.create(
      {
        type: ProductType.MENTORSHIP,
        title: input.title,
        slug: input.slug,
        subtitle: input.subtitle,
        description: input.description,
        accessType: AccessType.PAID,
        priceAmountMinor: input.priceAmountMinor,
        compareAtAmountMinor: input.compareAtAmountMinor ?? null,
      },
      actor,
      async (tx, created) => {
        const offering = await tx.mentorshipOffering.create({
          data: { productId: created.id, ...this.offeringFields(input) },
        });
        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'mentorship.offering_created',
            entityType: 'mentorship_offering',
            entityId: created.id,
            after: offering,
            ip: actor.ip,
          },
          tx,
        );
      },
    );

    return this.getForAdmin(product.id);
  }

  async update(id: string, input: OfferingInput, actor: Actor) {
    const before = await this.getRowOrThrow(id);
    this.validate(input);

    await this.products.update(
      id,
      {
        title: input.title,
        slug: input.slug,
        subtitle: input.subtitle,
        description: input.description,
        priceAmountMinor: input.priceAmountMinor,
        compareAtAmountMinor: input.compareAtAmountMinor,
      },
      actor,
      async (tx) => {
        const after = await tx.mentorshipOffering.update({
          where: { productId: id },
          data: this.offeringFields(input),
        });
        const { product: _product, rules: _rules, ...beforeRow } = before;
        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'mentorship.offering_updated',
            entityType: 'mentorship_offering',
            entityId: id,
            before: beforeRow,
            after,
            ip: actor.ip,
          },
          tx,
        );
      },
    );

    return this.getForAdmin(id);
  }

  async publish(id: string, actor: Actor) {
    const row = await this.getRowOrThrow(id);
    if (row.rules.length === 0) {
      throw new BadRequestException('Add weekly hours before publishing, or no one will find a free slot.');
    }
    await this.products.publish(id, actor);
    return this.getForAdmin(id);
  }

  async unpublish(id: string, actor: Actor) {
    await this.getRowOrThrow(id);
    await this.products.unpublish(id, actor);
    return this.getForAdmin(id);
  }

  /**
   * Replaces the weekly hours as one list — how the editor saves them. Calls
   * already booked are untouched: changing the hours changes what is offered
   * from now on, never what was sold.
   */
  async replaceRules(id: string, rules: RuleInput[], actor: Actor) {
    await this.getRowOrThrow(id);
    if (rules.length > MAX_RULES) throw new BadRequestException(`At most ${MAX_RULES} weekly windows.`);

    for (const rule of rules) {
      if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) {
        throw new BadRequestException('weekday must be 1 (Monday) to 7 (Sunday).');
      }
      assertWindow(rule.startMinute, rule.endMinute);
    }

    // Overlapping windows on one day are almost always a typo; refusing them
    // keeps the editor's picture the same as what is offered.
    for (let day = 1; day <= 7; day += 1) {
      const sorted = rules.filter((r) => r.weekday === day).sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].startMinute < sorted[i - 1].endMinute) {
          throw new BadRequestException('Two windows on the same day overlap.');
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.mentorshipAvailabilityRule.findMany({ where: { offeringId: id } });
      await tx.mentorshipAvailabilityRule.deleteMany({ where: { offeringId: id } });
      await tx.mentorshipAvailabilityRule.createMany({
        data: rules.map((rule) => ({ offeringId: id, ...rule })),
      });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'mentorship.hours_replaced',
          entityType: 'mentorship_offering',
          entityId: id,
          before,
          after: rules,
          ip: actor.ip,
        },
        tx,
      );
    });

    return this.getForAdmin(id);
  }

  /** Dated exceptions from today on (in the offering's zone), earliest first. */
  async listExceptions(id: string) {
    const row = await this.getRowOrThrow(id);
    const today = DateTime.now().setZone(row.timezone).toISODate()!;
    const rows = await this.prisma.mentorshipAvailabilityException.findMany({
      where: { offeringId: id, date: { gte: dateOnly(today) } },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
    });
    return rows.map(toExceptionView);
  }

  async addException(id: string, input: ExceptionInput, actor: Actor) {
    await this.getRowOrThrow(id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !DateTime.fromISO(input.date).isValid) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    }

    const whole = input.startMinute == null && input.endMinute == null;
    if (input.kind === MentorshipExceptionKind.EXTRA && whole) {
      throw new BadRequestException('An extra window needs a start and an end time.');
    }
    if (!whole) assertWindow(input.startMinute, input.endMinute);

    const created = await this.prisma.mentorshipAvailabilityException.create({
      data: {
        offeringId: id,
        date: dateOnly(input.date),
        kind: input.kind,
        startMinute: whole ? null : input.startMinute!,
        endMinute: whole ? null : input.endMinute!,
        note: input.note?.trim() || null,
      },
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: 'mentorship.exception_added',
      entityType: 'mentorship_offering',
      entityId: id,
      after: created,
      ip: actor.ip,
    });

    return toExceptionView(created);
  }

  async removeException(id: string, exceptionId: string, actor: Actor) {
    const existing = await this.prisma.mentorshipAvailabilityException.findFirst({
      where: { id: exceptionId, offeringId: id },
    });
    if (!existing) throw new NotFoundException('Exception not found');

    await this.prisma.mentorshipAvailabilityException.delete({ where: { id: exceptionId } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'mentorship.exception_removed',
      entityType: 'mentorship_offering',
      entityId: id,
      before: existing,
      ip: actor.ip,
    });
  }

  // --- shared ---------------------------------------------------------------

  async getRowOrThrow(id: string): Promise<OfferingRow> {
    const row = await this.prisma.mentorshipOffering.findFirst({
      where: { productId: id, product: { deletedAt: null } },
      include: OFFERING_INCLUDE,
    });
    if (!row) throw new NotFoundException('Mentorship offering not found');
    return row;
  }

  private validate(input: OfferingInput): void {
    if (input.priceAmountMinor !== undefined) {
      if (!/^\d{1,12}$/.test(input.priceAmountMinor) || BigInt(input.priceAmountMinor) < MIN_PRICE_MINOR) {
        throw new BadRequestException('A one-to-one call must cost at least ₹1.');
      }
    }
    if (input.timezone !== undefined && !IANAZone.isValidZone(input.timezone)) {
      throw new BadRequestException('timezone must be an IANA name such as Asia/Kolkata.');
    }
    // The remaining ranges are enforced by the DTO and, finally, by the
    // table's CHECK constraint.
  }

  private offeringFields(input: OfferingInput) {
    return {
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes,
      timezone: input.timezone,
      minNoticeMinutes: input.minNoticeMinutes,
      bookingWindowDays: input.bookingWindowDays,
      rescheduleCutoffMinutes: input.rescheduleCutoffMinutes,
      maxReschedules: input.maxReschedules,
      platformLabel: input.platformLabel?.trim() || undefined,
      highlights: input.highlights?.map((h) => h.trim()).filter(Boolean),
    };
  }

  private toPublic(row: OfferingRow) {
    return {
      id: row.productId,
      slug: row.product.slug,
      title: row.product.title,
      subtitle: row.product.subtitle,
      description: row.product.description,
      priceAmountMinor: row.product.priceAmountMinor.toString(),
      compareAtAmountMinor: row.product.compareAtAmountMinor?.toString() ?? null,
      currency: row.product.currency,
      durationMinutes: row.durationMinutes,
      timezone: row.timezone,
      bookingWindowDays: row.bookingWindowDays,
      rescheduleCutoffMinutes: row.rescheduleCutoffMinutes,
      platformLabel: row.platformLabel,
      highlights: row.highlights,
    };
  }

  private async toAdmin(row: OfferingRow) {
    const now = new Date();
    const [upcoming, needsAttention] = await Promise.all([
      this.prisma.mentorshipBooking.count({
        where: { offeringId: row.productId, status: MentorshipBookingStatus.CONFIRMED, startsAt: { gte: now } },
      }),
      this.prisma.mentorshipBooking.count({
        where: { offeringId: row.productId, status: MentorshipBookingStatus.PAID_UNSCHEDULED },
      }),
    ]);

    return {
      ...this.toPublic(row),
      status: row.product.status,
      bufferMinutes: row.bufferMinutes,
      minNoticeMinutes: row.minNoticeMinutes,
      maxReschedules: row.maxReschedules,
      rules: row.rules.map(({ id, weekday, startMinute, endMinute }) => ({ id, weekday, startMinute, endMinute })),
      upcomingBookings: upcoming,
      needsAttention,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function assertWindow(start: number | null | undefined, end: number | null | undefined): void {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start! < 0 ||
    end! > 1440 ||
    start! >= end!
  ) {
    throw new BadRequestException('A window needs a start before its end, within one day (minutes 0–1440).');
  }
}

/** A `YYYY-MM-DD` as the UTC-midnight Date Prisma uses for a DATE column. */
export function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function toExceptionView(row: {
  id: string;
  date: Date;
  kind: MentorshipExceptionKind;
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
}) {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    kind: row.kind,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    note: row.note,
  };
}
