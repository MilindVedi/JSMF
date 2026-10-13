import { Injectable } from '@nestjs/common';
import { MentorshipBookingStatus, Prisma, type MentorshipOffering } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { findOpenSlot, openSlots, type Slot, type SlotQuery } from '../domain/slots';

export interface ScheduleOptions {
  from?: Date;
  to?: Date;
  /** A booking being moved: its own time does not count as taken. */
  excludeBookingId?: string;
  now?: Date;
}

type Writer = PrismaService | Prisma.TransactionClient;

/**
 * Reads what the slot rule needs from the database — weekly hours, the dated
 * exceptions in range, and the times already taken — and hands it to the pure
 * functions in domain/slots.ts. Nothing here decides what is open; it only
 * gathers the facts, so the public list, holding a slot and rescheduling all
 * apply the same rule.
 *
 * "Taken" is exactly what the exclusion constraint protects: CONFIRMED rows,
 * and PENDING_PAYMENT rows whose hold has not lapsed. A lapsed hold is free
 * here even before the sweep marks it EXPIRED.
 */
@Injectable()
export class MentorshipScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async openSlots(offering: MentorshipOffering, options: ScheduleOptions = {}, db: Writer = this.prisma): Promise<Slot[]> {
    return openSlots(await this.query(offering, options, db));
  }

  /** The open slot starting exactly at `startsAt`, or null. */
  async findSlot(
    offering: MentorshipOffering,
    startsAt: Date,
    options: ScheduleOptions = {},
    db: Writer = this.prisma,
  ): Promise<Slot | null> {
    if (Number.isNaN(startsAt.getTime())) return null;
    // One day around the request is all the rule needs to see.
    const day = DateTime.fromJSDate(startsAt, { zone: offering.timezone });
    const query = await this.query(
      offering,
      { ...options, from: day.startOf('day').toJSDate(), to: day.endOf('day').toJSDate() },
      db,
    );
    return findOpenSlot(query, startsAt);
  }

  private async query(offering: MentorshipOffering, options: ScheduleOptions, db: Writer): Promise<SlotQuery> {
    const now = options.now ?? new Date();
    const windowEnd = new Date(now.getTime() + offering.bookingWindowDays * 24 * 60 * 60_000);
    const from = options.from ?? now;
    const to = options.to ?? windowEnd;

    // A day of margin either side: local dates and UTC instants differ by up
    // to a day, and a booking that starts just before `from` can still reach
    // into it.
    const marginFrom = new Date(from.getTime() - 24 * 60 * 60_000);
    const marginTo = new Date(to.getTime() + 24 * 60 * 60_000);

    const [rules, exceptions, busy] = await Promise.all([
      db.mentorshipAvailabilityRule.findMany({
        where: { offeringId: offering.productId },
        select: { weekday: true, startMinute: true, endMinute: true },
      }),
      db.mentorshipAvailabilityException.findMany({
        where: {
          offeringId: offering.productId,
          date: { gte: utcDate(marginFrom), lte: utcDate(marginTo) },
        },
      }),
      db.mentorshipBooking.findMany({
        where: {
          offeringId: offering.productId,
          ...(options.excludeBookingId ? { id: { not: options.excludeBookingId } } : {}),
          startsAt: { lt: marginTo },
          blockedUntil: { gt: marginFrom },
          OR: [
            { status: MentorshipBookingStatus.CONFIRMED },
            { status: MentorshipBookingStatus.PENDING_PAYMENT, holdExpiresAt: { gt: now } },
          ],
        },
        select: { startsAt: true, blockedUntil: true },
      }),
    ]);

    return {
      offering,
      rules,
      exceptions: exceptions.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        kind: e.kind,
        startMinute: e.startMinute,
        endMinute: e.endMinute,
      })),
      busy: busy.map((b) => ({ start: b.startsAt, end: b.blockedUntil })),
      now,
      from,
      to,
    };
  }
}

/** The UTC-midnight Date of an instant's UTC calendar day, for a DATE comparison. */
function utcDate(instant: Date): Date {
  return new Date(`${instant.toISOString().slice(0, 10)}T00:00:00.000Z`);
}
