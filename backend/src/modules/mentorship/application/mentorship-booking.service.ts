import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { MentorshipBookingStatus, Prisma, ProductType, UserStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { normaliseContactPhone } from '../../../shared/sms/domain/contact-phone';
import type { Actor } from '../../catalog/application/product.service';
import {
  OrderEvents,
  type OrderPaidEvent,
  type OrderPaidListener,
  type OrderRefundedEvent,
  type OrderRefundedListener,
} from '../../orders/application/order-events';
import { OrderService } from '../../orders/application/order.service';
import { callWhenLabel, durationLabel } from '../domain/display';
import { MentorshipMailer, type MailBooking } from './mentorship-mailer.service';
import { MentorshipOfferingService } from './mentorship-offering.service';
import { MentorshipScheduleService } from './mentorship-schedule.service';

export interface HoldInput {
  startsAt: string;
  attendeeName: string;
  whatsappNumber?: string;
  exam: string;
  notes?: string;
}

export type AdminBookingView = 'upcoming' | 'attention' | 'past' | 'cancelled' | 'all';

const BOOKING_INCLUDE = {
  offering: { include: { product: true } },
  user: { select: { email: true, name: true } },
  order: { select: { id: true, orderNumber: true, status: true, totalAmountMinor: true, currency: true } },
} satisfies Prisma.MentorshipBookingInclude;

type BookingRow = Prisma.MentorshipBookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

/** Statuses an attendee sees in "My bookings": everything except unpaid holds. */
const VISIBLE_TO_ATTENDEE: MentorshipBookingStatus[] = [
  MentorshipBookingStatus.CONFIRMED,
  MentorshipBookingStatus.PAID_UNSCHEDULED,
  MentorshipBookingStatus.COMPLETED,
  MentorshipBookingStatus.NO_SHOW,
  MentorshipBookingStatus.CANCELLED,
];

/**
 * Booking one-to-one calls: holding a slot while its buyer pays, confirming it
 * when the payment lands, moving it, and letting go of it on a refund.
 *
 * The double-booking guarantee is the database's, not this class's: an
 * exclusion constraint refuses any two active bookings whose times overlap.
 * Everything here checks the rule first so people get a clear message, then
 * relies on the constraint for the race that a check can never close.
 *
 * Payments reach this module only through OrderEvents (paid, refunded), and
 * periodic work only through SweepRegistry — the orders module and the
 * reminder trigger never learn this one exists.
 */
@Injectable()
export class MentorshipBookingService implements OrderPaidListener, OrderRefundedListener, OnModuleInit {
  private readonly logger = new Logger(MentorshipBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offerings: MentorshipOfferingService,
    private readonly schedule: MentorshipScheduleService,
    private readonly orders: OrderService,
    private readonly orderEvents: OrderEvents,
    private readonly sweeps: SweepRegistry,
    private readonly mailer: MentorshipMailer,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.orderEvents.register(this);
    this.orderEvents.registerRefundListener(this);
    this.sweeps.register({ name: 'mentorship', run: () => this.sweep() });
  }

  // --- the public slot list -------------------------------------------------

  async publicSlots(slug: string, range: { from?: Date; to?: Date }) {
    const offering = await this.offerings.publishedBySlugOrThrow(slug);
    const slots = await this.schedule.openSlots(offering, range);
    return {
      timezone: offering.timezone,
      durationMinutes: offering.durationMinutes,
      slots: slots.map((slot) => ({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })),
    };
  }

  // --- holding a slot and starting the payment -------------------------------

  /**
   * Holds the chosen time and starts the Razorpay checkout for it.
   *
   * The client sends only a start time; the server accepts it only if it is
   * one the rule itself offers, and prices the order from the product. The
   * hold lasts MENTORSHIP_HOLD_MINUTES. Asking again replaces this person's
   * earlier unpaid hold, so changing their mind never locks them out.
   */
  async hold(userId: string, slug: string, input: HoldInput) {
    const offering = await this.offerings.publishedBySlugOrThrow(slug);

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, status: true } });
    if (!user || user.status !== UserStatus.ACTIVE) throw new NotFoundException();
    if (!user.email) {
      throw new BadRequestException(
        'Add an email address to your account to book a call — the confirmation and joining link are sent there.',
      );
    }

    const startsAt = new Date(input.startsAt);
    const phone = input.whatsappNumber ? normaliseContactPhone(input.whatsappNumber) : null;
    const now = new Date();
    const holdExpiresAt = new Date(now.getTime() + this.config.get('MENTORSHIP_HOLD_MINUTES') * 60_000);

    let booking: { id: string };
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        // This person's earlier unpaid hold, and any lapsed hold at all, stop
        // occupying time before the new one is taken.
        await tx.mentorshipBooking.updateMany({
          where: { offeringId: offering.productId, userId, status: MentorshipBookingStatus.PENDING_PAYMENT },
          data: { status: MentorshipBookingStatus.EXPIRED },
        });
        await this.expireLapsedHolds(tx, offering.productId, now);

        const slot = await this.schedule.findSlot(offering, startsAt, { now }, tx);
        if (!slot) throw new ConflictException('That time is no longer available. Please pick another.');

        return tx.mentorshipBooking.create({
          data: {
            offeringId: offering.productId,
            userId,
            status: MentorshipBookingStatus.PENDING_PAYMENT,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            blockedUntil: slot.blockedUntil,
            holdExpiresAt,
            attendeeName: input.attendeeName.trim(),
            whatsappNumber: phone,
            exam: input.exam,
            notes: input.notes?.trim() || null,
          },
          select: { id: true },
        });
      });
    } catch (error) {
      if (isOverlap(error)) throw new ConflictException('That time was just taken. Please pick another.');
      throw error;
    }

    let checkout: Awaited<ReturnType<OrderService['checkout']>>;
    try {
      checkout = await this.orders.checkout({
        userId,
        productId: offering.productId,
        customerEmail: user.email,
        customerPhone: phone,
        allowedTypes: [ProductType.MENTORSHIP],
      });
    } catch (error) {
      // No order, so no reason to keep the time: let it go at once.
      await this.release(booking.id);
      throw error;
    }

    if (checkout.kind !== 'PAYMENT_REQUIRED') {
      // Unreachable: the offering's price is at least ₹1, enforced on save. A
      // free "booking" would bypass confirmation entirely, so refuse loudly.
      await this.release(booking.id);
      this.logger.error(`Mentorship offering ${offering.productId} produced a free checkout`);
      throw new ConflictException('This call cannot be booked right now. Please contact support.');
    }

    await this.prisma.mentorshipBooking.update({ where: { id: booking.id }, data: { orderId: checkout.orderId } });

    activity(this.logger, 'mentorship.slot_held', {
      bookingId: booking.id,
      userId,
      offeringId: offering.productId,
      startsAt: startsAt.toISOString(),
      orderNumber: checkout.orderNumber,
    });

    return { bookingId: booking.id, holdExpiresAt: holdExpiresAt.toISOString(), ...checkout };
  }

  // --- payment events --------------------------------------------------------

  /**
   * The payment landed: confirm the booking and send its one email.
   *
   * Usually the hold is still live. If it lapsed, the time is confirmed anyway
   * when nobody took it meanwhile; if someone did — or the time has already
   * passed — the booking becomes PAID_UNSCHEDULED and a person is told, rather
   * than anyone being double-booked or silently losing their money.
   */
  async onOrderPaid(event: OrderPaidEvent): Promise<{ confirmationHandled: boolean }> {
    if (!event.items.some((item) => item.productType === ProductType.MENTORSHIP)) {
      return { confirmationHandled: false };
    }

    const booking = await this.prisma.mentorshipBooking.findUnique({
      where: { orderId: event.orderId },
      include: BOOKING_INCLUDE,
    });

    if (!booking) {
      // Nothing to confirm; the generic receipt at least tells them they paid.
      this.logger.error(`Order ${event.orderNumber} paid for a call but has no booking`);
      return { confirmationHandled: false };
    }

    if (booking.status === MentorshipBookingStatus.CONFIRMED) return { confirmationHandled: true };

    const confirmable: MentorshipBookingStatus[] = [MentorshipBookingStatus.PENDING_PAYMENT, MentorshipBookingStatus.EXPIRED];
    if (!confirmable.includes(booking.status)) {
      this.logger.error(`Order ${event.orderNumber} paid for booking ${booking.id} in status ${booking.status}`);
      return { confirmationHandled: false };
    }

    const now = new Date();
    let confirmed = false;
    if (booking.startsAt > now) {
      try {
        const result = await this.prisma.mentorshipBooking.updateMany({
          where: { id: booking.id, status: { in: confirmable } },
          data: { status: MentorshipBookingStatus.CONFIRMED, confirmedAt: now, holdExpiresAt: null },
        });
        confirmed = result.count === 1;
      } catch (error) {
        if (!isOverlap(error)) throw error;
      }
    }

    const mailBooking = toMailBooking(booking);
    const receipt = {
      totalAmountMinor: event.totalAmountMinor,
      currency: event.currency,
      orderNumber: event.orderNumber,
      paymentId: event.paymentId,
    };

    if (confirmed) {
      activity(this.logger, 'mentorship.booking_confirmed', { bookingId: booking.id, orderNumber: event.orderNumber });
      if (await this.mailer.confirmed(mailBooking, receipt)) {
        await this.prisma.mentorshipBooking.update({ where: { id: booking.id }, data: { confirmationSentAt: new Date() } });
      }
      await this.mailer.adminAlert('BOOKED', mailBooking);
      return { confirmationHandled: true };
    }

    await this.prisma.mentorshipBooking.updateMany({
      where: { id: booking.id, status: { in: confirmable } },
      data: { status: MentorshipBookingStatus.PAID_UNSCHEDULED, holdExpiresAt: null },
    });
    activity(
      this.logger,
      'mentorship.paid_unscheduled',
      { bookingId: booking.id, orderNumber: event.orderNumber, startsAt: booking.startsAt.toISOString() },
      'warn',
    );
    await this.mailer.paidUnscheduled(mailBooking, receipt);
    await this.mailer.adminAlert('NEEDS_ATTENTION', mailBooking);
    return { confirmationHandled: true };
  }

  /**
   * The order was refunded in full: the call is off and its time is free. No
   * email from here — the refund notice the payment side sends is the one
   * message the attendee needs.
   */
  async onOrderRefunded(event: OrderRefundedEvent): Promise<void> {
    const result = await this.prisma.mentorshipBooking.updateMany({
      where: {
        orderId: event.orderId,
        status: {
          in: [
            MentorshipBookingStatus.PENDING_PAYMENT,
            MentorshipBookingStatus.EXPIRED,
            MentorshipBookingStatus.CONFIRMED,
            MentorshipBookingStatus.PAID_UNSCHEDULED,
          ],
        },
      },
      data: {
        status: MentorshipBookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: event.reason.slice(0, 300),
        holdExpiresAt: null,
      },
    });

    if (result.count > 0) {
      activity(this.logger, 'mentorship.booking_cancelled', { orderId: event.orderId, via: 'refund' });
    }
  }

  // --- the attendee's own bookings -------------------------------------------

  async mine(userId: string) {
    const rows = await this.prisma.mentorshipBooking.findMany({
      where: { userId, status: { in: VISIBLE_TO_ATTENDEE } },
      include: BOOKING_INCLUDE,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
    const now = new Date();
    return rows.map((row) => this.toAttendeeView(row, now));
  }

  async myBooking(userId: string, id: string) {
    return this.toAttendeeView(await this.ownOrThrow(userId, id), new Date());
  }

  /** Open times this booking could move to — its own time is not counted as taken. */
  async rescheduleSlots(userId: string, id: string, range: { from?: Date; to?: Date }) {
    const booking = await this.ownOrThrow(userId, id);
    this.assertSelfReschedulable(booking, new Date());
    const slots = await this.schedule.openSlots(booking.offering, { ...range, excludeBookingId: booking.id });
    return {
      timezone: booking.offering.timezone,
      durationMinutes: booking.offering.durationMinutes,
      slots: slots.map((slot) => ({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })),
    };
  }

  async reschedule(userId: string, id: string, startsAtIso: string) {
    const booking = await this.ownOrThrow(userId, id);
    const now = new Date();
    this.assertSelfReschedulable(booking, now);

    const startsAt = new Date(startsAtIso);
    if (startsAt.getTime() === booking.startsAt.getTime()) {
      throw new BadRequestException('Pick a different time to move your call.');
    }

    const moved = await this.moveTo(booking, startsAt, { now, byAdmin: false });
    activity(this.logger, 'mentorship.booking_rescheduled', { bookingId: id, by: 'attendee', userId });
    return this.toAttendeeView(moved, now);
  }

  // --- admin -------------------------------------------------------------------

  async listForAdmin(view: AdminBookingView, offeringId?: string) {
    const now = new Date();
    const scope: Prisma.MentorshipBookingWhereInput = offeringId ? { offeringId } : {};

    const where: Record<AdminBookingView, Prisma.MentorshipBookingWhereInput> = {
      upcoming: { status: MentorshipBookingStatus.CONFIRMED, endsAt: { gte: now } },
      attention: {
        OR: [
          { status: MentorshipBookingStatus.PAID_UNSCHEDULED },
          { status: MentorshipBookingStatus.CONFIRMED, endsAt: { gte: now }, meetUrl: null },
        ],
      },
      past: {
        status: { in: [MentorshipBookingStatus.CONFIRMED, MentorshipBookingStatus.COMPLETED, MentorshipBookingStatus.NO_SHOW] },
        endsAt: { lt: now },
      },
      cancelled: { status: MentorshipBookingStatus.CANCELLED },
      all: { status: { not: MentorshipBookingStatus.EXPIRED } },
    };

    const rows = await this.prisma.mentorshipBooking.findMany({
      where: { ...scope, ...where[view] },
      include: BOOKING_INCLUDE,
      orderBy: { startsAt: view === 'upcoming' || view === 'attention' ? 'asc' : 'desc' },
      take: 200,
    });
    return rows.map((row) => this.toAdminView(row));
  }

  async getForAdmin(id: string) {
    return this.toAdminView(await this.rowOrThrow(id));
  }

  /** Sets or changes the joining link, and emails it when the call is still ahead. */
  async setMeetUrl(id: string, meetUrl: string | null, actor: Actor) {
    const booking = await this.rowOrThrow(id);
    if (booking.status !== MentorshipBookingStatus.CONFIRMED) {
      throw new ConflictException('Only a confirmed call can have a joining link.');
    }

    const next = meetUrl?.trim() || null;
    if (next === booking.meetUrl) return this.toAdminView(booking);

    const updated = await this.prisma.mentorshipBooking.update({
      where: { id },
      data: { meetUrl: next },
      include: BOOKING_INCLUDE,
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'mentorship.meet_link_set',
      entityType: 'mentorship_booking',
      entityId: id,
      before: { meetUrl: booking.meetUrl },
      after: { meetUrl: next },
      ip: actor.ip,
    });

    if (next && updated.endsAt > new Date()) {
      const sent = await this.mailer.meetLink({ ...toMailBooking(updated), meetUrl: next });
      if (sent) {
        return this.toAdminView(
          await this.prisma.mentorshipBooking.update({
            where: { id },
            data: { meetLinkSentAt: new Date() },
            include: BOOKING_INCLUDE,
          }),
        );
      }
    }
    return this.toAdminView(updated);
  }

  /**
   * An admin moves a call — any future time, not only an advertised slot, so
   * a call can be fitted wherever Dr. Angad and the attendee agree. Also how a
   * PAID_UNSCHEDULED booking gets its time. Never counts against the
   * attendee's own reschedules. The double-booking guard still applies.
   */
  async adminReschedule(id: string, startsAtIso: string, actor: Actor) {
    const booking = await this.rowOrThrow(id);
    const allowed: MentorshipBookingStatus[] = [MentorshipBookingStatus.CONFIRMED, MentorshipBookingStatus.PAID_UNSCHEDULED];
    if (!allowed.includes(booking.status)) {
      throw new ConflictException('Only a confirmed or paid-but-unscheduled call can be moved.');
    }

    const startsAt = new Date(startsAtIso);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      throw new BadRequestException('Pick a time in the future.');
    }

    const offering = booking.offering;
    const endsAt = new Date(startsAt.getTime() + offering.durationMinutes * 60_000);
    const blockedUntil = new Date(endsAt.getTime() + offering.bufferMinutes * 60_000);
    const previous = { startsAt: booking.startsAt, endsAt: booking.endsAt };

    let moved: BookingRow;
    try {
      moved = await this.prisma.$transaction(async (tx) => {
        await this.expireLapsedHolds(tx, offering.productId, new Date());
        return tx.mentorshipBooking.update({
          where: { id },
          data: {
            status: MentorshipBookingStatus.CONFIRMED,
            confirmedAt: booking.confirmedAt ?? new Date(),
            startsAt,
            endsAt,
            blockedUntil,
            reminderSentAt: null,
          },
          include: BOOKING_INCLUDE,
        });
      });
    } catch (error) {
      if (isOverlap(error)) throw new ConflictException('Another call is already booked at that time.');
      throw error;
    }

    await this.audit.record({
      actorUserId: actor.id,
      action: 'mentorship.booking_rescheduled',
      entityType: 'mentorship_booking',
      entityId: id,
      before: { status: booking.status, ...previous },
      after: { status: moved.status, startsAt, endsAt },
      ip: actor.ip,
    });
    activity(this.logger, 'mentorship.booking_rescheduled', { bookingId: id, by: 'admin', adminId: actor.id });

    if (await this.mailer.rescheduled(toMailBooking(moved), previous, true)) {
      await this.prisma.mentorshipBooking.update({ where: { id }, data: { confirmationSentAt: new Date() } });
    }
    return this.getForAdmin(id);
  }

  /**
   * Marks a call completed or a no-show (once it has started), or cancels it.
   * Cancelling here does not refund — that is Orders → Refund, which cancels
   * the booking by itself and sends the refund email.
   */
  async setStatus(
    id: string,
    status: 'COMPLETED' | 'NO_SHOW' | 'CANCELLED',
    reason: string | null,
    notify: boolean,
    actor: Actor,
  ) {
    const booking = await this.rowOrThrow(id);
    const now = new Date();

    if (status === 'CANCELLED') {
      const cancellable: MentorshipBookingStatus[] = [MentorshipBookingStatus.CONFIRMED, MentorshipBookingStatus.PAID_UNSCHEDULED];
      if (!cancellable.includes(booking.status)) throw new ConflictException('This call cannot be cancelled.');
    } else {
      const finishable: MentorshipBookingStatus[] = [
        MentorshipBookingStatus.CONFIRMED,
        MentorshipBookingStatus.COMPLETED,
        MentorshipBookingStatus.NO_SHOW,
      ];
      if (!finishable.includes(booking.status)) throw new ConflictException('Only a confirmed call can be marked.');
      if (booking.startsAt > now) throw new ConflictException('A call can be marked only after it has started.');
    }

    const updated = await this.prisma.mentorshipBooking.update({
      where: { id },
      data: {
        status,
        ...(status === 'CANCELLED' ? { cancelledAt: now, cancelReason: reason?.trim().slice(0, 300) || null } : {}),
      },
      include: BOOKING_INCLUDE,
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: `mentorship.booking_${status.toLowerCase()}`,
      entityType: 'mentorship_booking',
      entityId: id,
      before: { status: booking.status },
      after: { status, reason },
      ip: actor.ip,
    });

    if (status === 'CANCELLED' && notify) await this.mailer.cancelled(toMailBooking(updated), reason?.trim() || null);
    return this.toAdminView(updated);
  }

  // --- the 5-minute sweep ------------------------------------------------------

  /**
   * Lets go of lapsed holds, and sends each confirmed call its reminder once a
   * joining link exists and the call is within MENTORSHIP_REMINDER_LEAD_MINUTES.
   *
   * A reminder is claimed (reminder_sent_at set where it is still null) before
   * it is sent, so two overlapping sweeps cannot both send it; a failed send
   * releases the claim and the next sweep tries again.
   */
  async sweep() {
    const now = new Date();
    const expired = await this.expireLapsedHolds(this.prisma, undefined, now);

    const leadMs = this.config.get('MENTORSHIP_REMINDER_LEAD_MINUTES') * 60_000;
    const due = await this.prisma.mentorshipBooking.findMany({
      where: {
        status: MentorshipBookingStatus.CONFIRMED,
        reminderSentAt: null,
        startsAt: { gt: now, lte: new Date(now.getTime() + leadMs) },
      },
      include: BOOKING_INCLUDE,
    });

    let sent = 0;
    let awaitingLink = 0;
    for (const booking of due) {
      if (!booking.meetUrl) {
        awaitingLink += 1;
        continue;
      }
      const claim = await this.prisma.mentorshipBooking.updateMany({
        where: { id: booking.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (claim.count !== 1) continue;

      if (await this.mailer.reminder({ ...toMailBooking(booking), meetUrl: booking.meetUrl })) {
        sent += 1;
      } else {
        await this.prisma.mentorshipBooking.update({ where: { id: booking.id }, data: { reminderSentAt: null } });
      }
    }

    if (awaitingLink > 0) {
      this.logger.warn(`${awaitingLink} one-to-one call(s) start soon with no joining link — reminders held until one is added`);
    }
    return { expiredHolds: expired, reminders: sent, awaitingLink };
  }

  // --- internals ---------------------------------------------------------------

  /** Shared by the attendee's reschedule: checks the rule, then moves under the constraint. */
  private async moveTo(booking: BookingRow, startsAt: Date, options: { now: Date; byAdmin: boolean }): Promise<BookingRow> {
    const previous = { startsAt: booking.startsAt, endsAt: booking.endsAt };

    let moved: BookingRow;
    try {
      moved = await this.prisma.$transaction(async (tx) => {
        await this.expireLapsedHolds(tx, booking.offeringId, options.now);
        const slot = await this.schedule.findSlot(
          booking.offering,
          startsAt,
          { now: options.now, excludeBookingId: booking.id },
          tx,
        );
        if (!slot) throw new ConflictException('That time is no longer available. Please pick another.');

        const result = await tx.mentorshipBooking.updateMany({
          where: { id: booking.id, status: MentorshipBookingStatus.CONFIRMED, rescheduleCount: booking.rescheduleCount },
          data: {
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            blockedUntil: slot.blockedUntil,
            rescheduleCount: { increment: 1 },
            reminderSentAt: null,
          },
        });
        // Changed underneath us (a second tab, an admin): refuse rather than
        // move it twice or past the reschedule limit.
        if (result.count !== 1) throw new ConflictException('This booking just changed. Please refresh and try again.');

        return tx.mentorshipBooking.findUniqueOrThrow({ where: { id: booking.id }, include: BOOKING_INCLUDE });
      });
    } catch (error) {
      if (isOverlap(error)) throw new ConflictException('That time was just taken. Please pick another.');
      throw error;
    }

    const mail = toMailBooking(moved);
    if (await this.mailer.rescheduled(mail, previous, options.byAdmin)) {
      await this.prisma.mentorshipBooking.update({ where: { id: moved.id }, data: { confirmationSentAt: new Date() } });
    }
    await this.mailer.adminAlert('RESCHEDULED', mail, previous);
    return moved;
  }

  private assertSelfReschedulable(booking: BookingRow, now: Date): void {
    const reason = selfRescheduleBlock(booking, now);
    if (reason) throw new ConflictException(reason);
  }

  /** Lapsed holds stop occupying time. Scoped to one offering when given. */
  private async expireLapsedHolds(
    db: PrismaService | Prisma.TransactionClient,
    offeringId: string | undefined,
    now: Date,
  ): Promise<number> {
    const result = await db.mentorshipBooking.updateMany({
      where: {
        ...(offeringId ? { offeringId } : {}),
        status: MentorshipBookingStatus.PENDING_PAYMENT,
        holdExpiresAt: { lte: now },
      },
      data: { status: MentorshipBookingStatus.EXPIRED },
    });
    return result.count;
  }

  private async release(bookingId: string): Promise<void> {
    await this.prisma.mentorshipBooking.updateMany({
      where: { id: bookingId, status: MentorshipBookingStatus.PENDING_PAYMENT },
      data: { status: MentorshipBookingStatus.EXPIRED },
    });
  }

  /** The attendee's own booking, or 404 — never revealing that someone else's exists. */
  private async ownOrThrow(userId: string, id: string): Promise<BookingRow> {
    const row = await this.prisma.mentorshipBooking.findFirst({
      where: { id, userId, status: { in: VISIBLE_TO_ATTENDEE } },
      include: BOOKING_INCLUDE,
    });
    if (!row) throw new NotFoundException('Booking not found');
    return row;
  }

  private async rowOrThrow(id: string): Promise<BookingRow> {
    const row = await this.prisma.mentorshipBooking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
    if (!row) throw new NotFoundException('Booking not found');
    return row;
  }

  private toAttendeeView(row: BookingRow, now: Date) {
    const block = selfRescheduleBlock(row, now);
    const offering = row.offering;
    // The link is the attendee's, but only while it is useful: an old call's
    // room has no business staying in a response forever.
    const linkVisible = row.status === MentorshipBookingStatus.CONFIRMED && row.endsAt.getTime() > now.getTime() - 24 * 60 * 60_000;

    return {
      id: row.id,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      whenLabel: callWhenLabel(row.startsAt, row.endsAt, offering.timezone),
      meetUrl: linkVisible ? row.meetUrl : null,
      attendeeName: row.attendeeName,
      offering: {
        slug: offering.product.slug,
        title: offering.product.title,
        platformLabel: offering.platformLabel,
        durationMinutes: offering.durationMinutes,
        timezone: offering.timezone,
      },
      canReschedule: block === null,
      rescheduleBlockedReason: block,
      reschedulesLeft: Math.max(0, offering.maxReschedules - row.rescheduleCount),
      orderNumber: row.order?.orderNumber ?? null,
    };
  }

  private toAdminView(row: BookingRow) {
    return {
      id: row.id,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      whenLabel: callWhenLabel(row.startsAt, row.endsAt, row.offering.timezone),
      attendeeName: row.attendeeName,
      email: row.user.email,
      accountName: row.user.name,
      whatsappNumber: row.whatsappNumber,
      exam: row.exam,
      notes: row.notes,
      meetUrl: row.meetUrl,
      rescheduleCount: row.rescheduleCount,
      offering: { id: row.offeringId, title: row.offering.product.title, timezone: row.offering.timezone },
      order: row.order
        ? {
            id: row.order.id,
            orderNumber: row.order.orderNumber,
            status: row.order.status,
            totalAmountMinor: row.order.totalAmountMinor.toString(),
            currency: row.order.currency,
          }
        : null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      confirmationSentAt: row.confirmationSentAt?.toISOString() ?? null,
      meetLinkSentAt: row.meetLinkSentAt?.toISOString() ?? null,
      reminderSentAt: row.reminderSentAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** Why the attendee may not move this booking themselves right now, or null. */
function selfRescheduleBlock(row: BookingRow, now: Date): string | null {
  if (row.status !== MentorshipBookingStatus.CONFIRMED) return 'Only an upcoming call can be moved.';
  const cutoff = row.startsAt.getTime() - row.offering.rescheduleCutoffMinutes * 60_000;
  if (now.getTime() >= cutoff) {
    return `Calls can be moved up to ${durationLabel(row.offering.rescheduleCutoffMinutes)} before they start. Please contact support.`;
  }
  if (row.rescheduleCount >= row.offering.maxReschedules) {
    return 'This call has already been moved as many times as allowed. Please contact support.';
  }
  return null;
}

function toMailBooking(row: BookingRow): MailBooking {
  return {
    id: row.id,
    attendeeName: row.attendeeName,
    email: row.user.email,
    whatsappNumber: row.whatsappNumber,
    exam: row.exam,
    notes: row.notes,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    meetUrl: row.meetUrl,
    offering: {
      title: row.offering.product.title,
      timezone: row.offering.timezone,
      platformLabel: row.offering.platformLabel,
      rescheduleCutoffMinutes: row.offering.rescheduleCutoffMinutes,
    },
  };
}

/**
 * The exclusion constraint refusing an overlap. Prisma reports it as an
 * unknown request error, so the constraint's name (and Postgres's code for an
 * exclusion violation, 23P01) are what identify it.
 */
export function isOverlap(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('mentorship_bookings_no_overlap') || text.includes('23P01');
}
