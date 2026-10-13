import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import { activity } from '../../../shared/logging/activity';
import { MailService } from '../../../shared/mail/application/mail.service';
import type { RenderedMail } from '../../../shared/mail/templates/mail-templates';
import {
  mentorshipAdminAlert,
  mentorshipBookingConfirmed,
  mentorshipCancelled,
  mentorshipMeetLink,
  mentorshipPaidUnscheduled,
  mentorshipReminder,
  mentorshipRescheduled,
} from '../../../shared/mail/templates/mentorship-templates';
import { callWhenLabel, durationLabel } from '../domain/display';
import { firstName, formatMoney } from '../domain/options';

/** What every email needs to know about a booking. */
export interface MailBooking {
  id: string;
  attendeeName: string;
  email: string | null;
  whatsappNumber: string | null;
  exam: string;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  meetUrl: string | null;
  offering: {
    title: string;
    timezone: string;
    platformLabel: string;
    rescheduleCutoffMinutes: number;
  };
}

/**
 * Every email the one-to-one feature sends, and the one rule they all follow:
 * **best effort**. The booking, the payment, the reschedule have already
 * happened by the time any of these runs; a mail provider that is down must
 * never turn that into an error. Each method reports whether it delivered, so
 * callers can record a "sent at" only for mail that actually left.
 */
@Injectable()
export class MentorshipMailer {
  private readonly logger = new Logger(MentorshipMailer.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  confirmed(booking: MailBooking, receipt: { totalAmountMinor: bigint; currency: string; orderNumber: string; paymentId: string }) {
    return this.toAttendee(booking, 'mentorship-confirmation', mentorshipBookingConfirmed({
      attendeeName: firstName(booking.attendeeName),
      title: booking.offering.title,
      whenLabel: this.when(booking),
      platformLabel: booking.offering.platformLabel,
      meetUrl: booking.meetUrl,
      totalFormatted: formatMoney(receipt.totalAmountMinor, receipt.currency),
      orderNumber: receipt.orderNumber,
      paymentId: receipt.paymentId,
      manageUrl: this.manageUrl(),
      rescheduleNote: `You can move it yourself until ${durationLabel(booking.offering.rescheduleCutoffMinutes)} before it starts.`,
    }));
  }

  meetLink(booking: MailBooking & { meetUrl: string }) {
    return this.toAttendee(booking, 'mentorship-meet-link', mentorshipMeetLink({
      attendeeName: firstName(booking.attendeeName),
      title: booking.offering.title,
      whenLabel: this.when(booking),
      platformLabel: booking.offering.platformLabel,
      meetUrl: booking.meetUrl,
      manageUrl: this.manageUrl(),
    }));
  }

  reminder(booking: MailBooking & { meetUrl: string }) {
    return this.toAttendee(booking, 'mentorship-reminder', mentorshipReminder({
      attendeeName: firstName(booking.attendeeName),
      title: booking.offering.title,
      whenLabel: this.when(booking),
      platformLabel: booking.offering.platformLabel,
      meetUrl: booking.meetUrl,
    }));
  }

  rescheduled(booking: MailBooking, previous: { startsAt: Date; endsAt: Date }, byAdmin: boolean) {
    return this.toAttendee(booking, 'mentorship-rescheduled', mentorshipRescheduled({
      attendeeName: firstName(booking.attendeeName),
      title: booking.offering.title,
      previousWhenLabel: callWhenLabel(previous.startsAt, previous.endsAt, booking.offering.timezone),
      whenLabel: this.when(booking),
      platformLabel: booking.offering.platformLabel,
      meetUrl: booking.meetUrl,
      manageUrl: this.manageUrl(),
      byAdmin,
    }));
  }

  paidUnscheduled(booking: MailBooking, receipt: { totalAmountMinor: bigint; currency: string; orderNumber: string }) {
    return this.toAttendee(booking, 'mentorship-paid-unscheduled', mentorshipPaidUnscheduled({
      attendeeName: firstName(booking.attendeeName),
      title: booking.offering.title,
      whenLabel: this.when(booking),
      totalFormatted: formatMoney(receipt.totalAmountMinor, receipt.currency),
      orderNumber: receipt.orderNumber,
      supportEmail: this.config.get('MAIL_REPLY_TO'),
    }));
  }

  cancelled(booking: MailBooking, reason: string | null) {
    return this.toAttendee(booking, 'mentorship-cancelled', mentorshipCancelled({
      attendeeName: firstName(booking.attendeeName),
      title: booking.offering.title,
      whenLabel: this.when(booking),
      reason,
      supportEmail: this.config.get('MAIL_REPLY_TO'),
    }));
  }

  /** The internal heads-up. Silently skipped when no address is configured. */
  async adminAlert(
    kind: 'BOOKED' | 'RESCHEDULED' | 'NEEDS_ATTENTION',
    booking: MailBooking,
    previous?: { startsAt: Date; endsAt: Date },
  ): Promise<boolean> {
    const to = this.config.get('MENTORSHIP_ADMIN_NOTIFY_EMAIL');
    if (!to) return false;

    const rendered = mentorshipAdminAlert({
      kind,
      attendeeName: booking.attendeeName,
      email: booking.email,
      whatsappNumber: booking.whatsappNumber,
      exam: booking.exam,
      notes: booking.notes,
      whenLabel: this.when(booking),
      previousWhenLabel: previous
        ? callWhenLabel(previous.startsAt, previous.endsAt, booking.offering.timezone)
        : undefined,
      adminUrl: `${this.config.get('ADMIN_APP_URL').replace(/\/$/, '')}/admin/mentorship/bookings/${booking.id}`,
    });

    return this.send(to, null, `mentorship-admin-${kind.toLowerCase()}`, rendered, booking.id);
  }

  private when(booking: MailBooking): string {
    return callWhenLabel(booking.startsAt, booking.endsAt, booking.offering.timezone);
  }

  private manageUrl(): string {
    return `${this.config.get('MAIN_WEBSITE_URL').replace(/\/$/, '')}/mentorship/bookings`;
  }

  private async toAttendee(booking: MailBooking, tag: string, rendered: RenderedMail): Promise<boolean> {
    if (!booking.email) {
      // Booking requires an email, so this is a data problem worth seeing.
      this.logger.warn(`Booking ${booking.id} has no email; "${tag}" not sent`);
      return false;
    }
    return this.send(booking.email, booking.attendeeName, tag, rendered, booking.id);
  }

  private async send(email: string, name: string | null, tag: string, rendered: RenderedMail, bookingId: string): Promise<boolean> {
    const outcome = await this.mail.sendBestEffort({
      to: name ? { email, name } : { email },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag,
    });

    if (!outcome.delivered) {
      activity(this.logger, 'mentorship.mail_not_delivered', { bookingId, tag, reason: outcome.reason }, 'warn');
    }
    return outcome.delivered;
  }
}
