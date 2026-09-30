import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EntitlementStatus, ProductStatus, ProductType } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { MailService } from '../../../shared/mail/application/mail.service';
import {
  liveSessionConfirmation,
  liveSessionReminder,
} from '../../../shared/mail/templates/mail-templates';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  OrderEvents,
  type OrderPaidEvent,
  type OrderPaidListener,
} from '../../orders/application/order-events';
import { firstName, formatMoney, sessionDayLabel, sessionWhenLines } from '../domain/session-display';

/**
 * The two emails a live session sends: the confirmation when a seat is paid
 * for, and the reminder shortly before it starts.
 *
 * Both are best-effort, the platform-wide rule: the seat exists as an
 * entitlement whether or not an email arrives, so a bounced email is logged
 * and never turns a completed payment into an error.
 */
@Injectable()
export class LiveSessionNotifications implements OrderPaidListener, OnModuleInit {
  private readonly logger = new Logger(LiveSessionNotifications.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly orderEvents: OrderEvents,
  ) {}

  onModuleInit(): void {
    this.orderEvents.register(this);
  }

  /**
   * Called once per order, after it is durably paid. Orders that contain no
   * session are left alone, and the ordinary purchase receipt goes out.
   */
  async onOrderPaid(event: OrderPaidEvent): Promise<{ confirmationHandled: boolean }> {
    const item = event.items.find((i) => i.productType === ProductType.LIVE_SESSION);
    if (!item) return { confirmationHandled: false };

    // No email means a mobile-only account, which cannot register (the API
    // refuses it). Hand back to the generic receipt path rather than send nothing.
    if (!event.customerEmail) return { confirmationHandled: false };

    const session = await this.prisma.liveSession.findUnique({
      where: { productId: item.productId },
      include: {
        days: { orderBy: { startsAt: 'asc' } },
        product: {
          include: {
            bundleItems: {
              orderBy: { sortOrder: 'asc' },
              include: { child: { select: { title: true } } },
            },
          },
        },
      },
    });

    if (!session) return { confirmationHandled: false };

    const rendered = liveSessionConfirmation({
      attendeeName: firstName(event.customerName),
      sessionTitle: session.product.title,
      whenLines: sessionWhenLines(session.days),
      platformLabel: session.platformLabel,
      joinUrl: session.joinUrl,
      totalFormatted: formatMoney(event.totalAmountMinor, event.currency),
      orderNumber: event.orderNumber,
      paymentId: event.paymentId,
      includedTitles: session.product.bundleItems.map((b) => b.child.title),
      libraryUrl: `${this.config.get('STOREFRONT_URL').replace(/\/$/, '')}/library`,
    });

    const outcome = await this.mail.sendBestEffort({
      to: { email: event.customerEmail, name: event.customerName },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag: 'session-confirmation',
    });

    if (outcome.delivered) {
      await this.prisma.sessionRegistration.updateMany({
        where: { liveSessionId: session.productId, userId: event.userId },
        data: { confirmationSentAt: new Date() },
      });
    } else {
      this.logger.warn(
        `Session confirmation not delivered for ${event.orderNumber} (${outcome.reason}) — ` +
          `the seat is paid for and granted regardless`,
      );
    }

    // Handled either way: the generic "your files are in your library" receipt
    // is the wrong message for a session, and would likely fail the same way.
    return { confirmationHandled: true };
  }

  /**
   * Sends reminders for session days starting within the lead time. Run by the
   * same external 5-minute clock as payment reconciliation. A multi-day
   * session is reminded once per day, before each day.
   *
   * Each reminder is **claimed** before its email is sent, by inserting its
   * (registration, day) row — the primary key lets only one insert win — so two
   * overlapping sweeps cannot both email the same person for the same day. A
   * failed send deletes the claim, and the next sweep retries until that day
   * starts.
   *
   * A session with no joining link yet is skipped, not reminded: a reminder
   * without the link is the one email that makes people miss the session. It
   * is retried every sweep, so adding the link late still reaches everyone.
   */
  async sendDueReminders() {
    const now = new Date();
    const lead = this.config.get('SESSION_REMINDER_LEAD_MINUTES');
    const horizon = new Date(now.getTime() + lead * 60_000);

    const days = await this.prisma.liveSessionDay.findMany({
      where: {
        startsAt: { gt: now, lte: horizon },
        liveSession: { product: { status: ProductStatus.PUBLISHED, deletedAt: null } },
      },
      include: {
        liveSession: {
          include: {
            product: { select: { title: true } },
            days: { select: { id: true }, orderBy: { startsAt: 'asc' } },
          },
        },
      },
    });

    let sent = 0;
    let failed = 0;
    let awaitingLink = 0;

    for (const day of days) {
      const session = day.liveSession;

      const due = await this.prisma.sessionRegistration.findMany({
        where: {
          liveSessionId: session.productId,
          dayReminders: { none: { liveSessionDayId: day.id } },
          // Only seat holders: a registration row alone may be an abandoned checkout.
          user: {
            entitlements: { some: { productId: session.productId, status: EntitlementStatus.ACTIVE } },
          },
        },
        include: { user: { select: { name: true, email: true } } },
      });

      if (due.length === 0) continue;

      if (!session.joinUrl) {
        awaitingLink += due.length;
        this.logger.warn(
          `Session "${session.product.title}" has a day starting ${day.startsAt.toISOString()} with ` +
            `${due.length} seat holder(s) and no joining link — reminders held until one is added`,
        );
        continue;
      }

      const total = session.days.length;
      const dayMarker = total > 1 ? `Day ${session.days.findIndex((d) => d.id === day.id) + 1} of ${total}` : null;

      for (const registration of due) {
        if (!registration.user.email) continue;

        const claimed = await this.prisma.sessionDayReminder.createMany({
          data: [{ registrationId: registration.id, liveSessionDayId: day.id }],
          skipDuplicates: true,
        });
        if (claimed.count !== 1) continue;

        const rendered = liveSessionReminder({
          attendeeName: firstName(registration.user.name),
          sessionTitle: session.product.title,
          whenLabel: sessionDayLabel(day),
          dayMarker,
          platformLabel: session.platformLabel,
          joinUrl: session.joinUrl,
        });

        const outcome = await this.mail.sendBestEffort({
          to: { email: registration.user.email, name: registration.user.name },
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          tag: 'session-reminder',
        });

        if (outcome.delivered) {
          sent++;
        } else {
          failed++;
          await this.prisma.sessionDayReminder.delete({
            where: {
              registrationId_liveSessionDayId: { registrationId: registration.id, liveSessionDayId: day.id },
            },
          });
        }
      }
    }

    if (sent || failed) {
      this.logger.log(`Session reminders: ${sent} sent, ${failed} failed (will retry)`);
    }

    return { days: days.length, sent, failed, awaitingLink };
  }
}
