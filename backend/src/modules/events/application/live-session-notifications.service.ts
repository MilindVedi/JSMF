import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  AnnouncementStatus,
  BundleDeliveryMode,
  BundleDeliveryStatus,
  EntitlementSource,
  EntitlementStatus,
  ProductStatus,
  ProductType,
} from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { activity } from '../../../shared/logging/activity';
import { MailService } from '../../../shared/mail/application/mail.service';
import {
  liveSessionBundleReady,
  liveSessionConfirmation,
  liveSessionDatesAnnounced,
  liveSessionReminder,
} from '../../../shared/mail/templates/mail-templates';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import {
  OrderEvents,
  type OrderPaidEvent,
  type OrderPaidListener,
} from '../../orders/application/order-events';
import { firstName, formatMoney, sessionDayLabel, sessionWhenLines } from '../domain/session-display';

/** One buyer's row in the admin's delivery table. */
export interface BundleDeliveryRow {
  userId: string;
  name: string;
  email: string | null;
  status: BundleDeliveryStatus;
  lastError: string | null;
  sentAt: Date | null;
  attempts: number;
}

/** One buyer's row in the admin's date-announcement table. */
export interface DateAnnouncementRow {
  userId: string;
  name: string;
  email: string | null;
  status: AnnouncementStatus;
  lastError: string | null;
  sentAt: Date | null;
  attempts: number;
}

/** Why sending is not possible yet, or null when it is. */
type SendBlocker = string | null;

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
    private readonly entitlements: EntitlementService,
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
              // Same filter settlement grants with, so the email never names
              // something that was not actually granted.
              where: { child: { deletedAt: null } },
              orderBy: { sortOrder: 'asc' },
              include: { child: { select: { title: true } } },
            },
          },
        },
      },
    });

    if (!session) return { confirmationHandled: false };

    // The template says the included items are "already in your JSMF
    // library". That is only true when they were granted at payment; a
    // deferred session grants them after it ends and announces them then
    // (liveSessionBundleReady), so naming them here would promise a PDF the
    // buyer opens their library to find missing.
    const grantedNow = session.bundleDeliveryMode === BundleDeliveryMode.IMMEDIATE;

    const rendered = liveSessionConfirmation({
      attendeeName: firstName(event.customerName),
      sessionTitle: session.product.title,
      whenLines: sessionWhenLines(session.days),
      platformLabel: session.platformLabel,
      joinUrl: session.joinUrl,
      totalFormatted: formatMoney(event.totalAmountMinor, event.currency),
      orderNumber: event.orderNumber,
      paymentId: event.paymentId,
      includedTitles: grantedNow ? session.product.bundleItems.map((b) => b.child.title) : [],
      libraryUrl: `${this.config.get('STOREFRONT_URL').replace(/\/$/, '')}/library`,
      subjectOverride: session.confirmationSubject,
      pendingJoinLinkText: session.pendingJoinLinkText,
      showNotSpamNotice: session.showNotSpamNotice,
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
      activity(this.logger, 'session.confirmation_sent', {
        orderNumber: event.orderNumber,
        userId: event.userId,
        sessionId: session.productId,
        joinLinkIncluded: Boolean(session.joinUrl),
      });
    } else {
      activity(this.logger, 'session.confirmation_not_delivered', {
        orderNumber: event.orderNumber,
        userId: event.userId,
        sessionId: session.productId,
        reason: outcome.reason,
        note: 'the seat is paid for and granted regardless',
      }, 'warn');
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
          showNotSpamNotice: session.showNotSpamNotice,
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

  // --- deferred delivery of a session's included items ----------------------

  /**
   * The session, its days, and the included products — everything both the
   * listing and the sending need.
   */
  private async loadForDelivery(sessionId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { productId: sessionId },
      include: {
        days: { orderBy: { startsAt: 'asc' } },
        product: {
          include: {
            bundleItems: {
              orderBy: { sortOrder: 'asc' },
              include: { child: { select: { id: true, title: true, status: true, deletedAt: true } } },
            },
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /**
   * When the last day finishes. Derived rather than stored: `startsAt` is the
   * only time a day carries, and its length is what turns that into an end.
   */
  private endsAt(days: Array<{ startsAt: Date; durationMinutes: number }>): Date {
    return days.reduce((latest, day) => {
      const end = new Date(day.startsAt.getTime() + day.durationMinutes * 60_000);
      return end > latest ? end : latest;
    }, new Date(0));
  }

  /**
   * Whether this session's included items can be sent right now, and if not,
   * the reason in the words the admin should see. Returned rather than thrown
   * so the listing can disable a button and explain itself in the same call
   * that renders the table.
   */
  private sendBlocker(session: {
    bundleDeliveryMode: BundleDeliveryMode;
    days: Array<{ startsAt: Date; durationMinutes: number }>;
    product: { bundleItems: Array<{ child: { status: ProductStatus; deletedAt: Date | null } }> };
  }): SendBlocker {
    if (session.bundleDeliveryMode === BundleDeliveryMode.IMMEDIATE) {
      return 'This session delivers its included material at payment, so there is nothing to send.';
    }

    if (session.days.length === 0) return 'This session has no days yet.';

    if (this.endsAt(session.days) > new Date()) {
      return 'The session has not finished yet. Included material is sent once it is over.';
    }

    const ready = session.product.bundleItems.filter(
      (item) => item.child.status === ProductStatus.PUBLISHED && !item.child.deletedAt,
    );

    if (ready.length === 0) {
      return 'No included material is published yet. Upload and publish the PDF, then add it to this session.';
    }

    return null;
  }

  /**
   * Every seat holder and where their included material has got to.
   *
   * A buyer with no delivery row has simply never been sent anything, which is
   * PENDING — the row is written when a send is first attempted, so the table
   * does not depend on rows existing before anyone presses anything.
   */
  async listBundleDeliveries(sessionId: string): Promise<{
    mode: BundleDeliveryMode;
    blocker: SendBlocker;
    includedTitles: string[];
    rows: BundleDeliveryRow[];
  }> {
    const session = await this.loadForDelivery(sessionId);

    const [holders, deliveries] = await Promise.all([
      this.prisma.entitlement.findMany({
        where: { productId: sessionId, status: EntitlementStatus.ACTIVE },
        select: { userId: true, user: { select: { name: true, email: true } } },
      }),
      this.prisma.sessionBundleDelivery.findMany({ where: { liveSessionId: sessionId } }),
    ]);

    const byUser = new Map(deliveries.map((row) => [row.userId, row]));

    return {
      mode: session.bundleDeliveryMode,
      blocker: this.sendBlocker(session),
      includedTitles: session.product.bundleItems
        .filter((item) => item.child.status === ProductStatus.PUBLISHED && !item.child.deletedAt)
        .map((item) => item.child.title),
      rows: holders.map((holder) => {
        const delivery = byUser.get(holder.userId);
        return {
          userId: holder.userId,
          name: holder.user.name,
          email: holder.user.email,
          status: delivery?.status ?? BundleDeliveryStatus.PENDING,
          lastError: delivery?.lastError ?? null,
          sentAt: delivery?.sentAt ?? null,
          attempts: delivery?.attempts ?? 0,
        };
      }),
    };
  }

  /**
   * Grants a session's included items to buyers and tells them.
   *
   * The one path all three callers take — the automatic sweep, an admin's
   * "send to everyone", and an admin sending to one person — so the rule that
   * matters most lives in exactly one place: anyone already SENT is never sent
   * to again, whatever triggered this.
   *
   * `userIds` omitted means everyone not yet sent, which is both "send to all
   * pending" and "retry the failures" at once — a failed row is, by definition,
   * one that has not been sent.
   */
  async releaseBundle(
    sessionId: string,
    options: { userIds?: string[] } = {},
  ): Promise<{
    attempted: number;
    sent: number;
    failed: Array<{ userId: string; name: string; email: string | null; reason: string }>;
  }> {
    const session = await this.loadForDelivery(sessionId);

    const blocker = this.sendBlocker(session);
    if (blocker) throw new BadRequestException(blocker);

    const ready = session.product.bundleItems
      .filter((item) => item.child.status === ProductStatus.PUBLISHED && !item.child.deletedAt)
      .map((item) => item.child);

    const holders = await this.prisma.entitlement.findMany({
      where: {
        productId: sessionId,
        status: EntitlementStatus.ACTIVE,
        ...(options.userIds?.length ? { userId: { in: options.userIds } } : {}),
      },
      select: {
        userId: true,
        sourceOrderId: true,
        user: { select: { name: true, email: true } },
      },
    });

    const alreadySent = new Set(
      (
        await this.prisma.sessionBundleDelivery.findMany({
          where: { liveSessionId: sessionId, status: BundleDeliveryStatus.SENT },
          select: { userId: true },
        })
      ).map((row) => row.userId),
    );

    const targets = holders.filter((holder) => !alreadySent.has(holder.userId));

    let sent = 0;
    const failed: Array<{ userId: string; name: string; email: string | null; reason: string }> = [];

    for (const holder of targets) {
      const result = await this.deliverTo(session, ready, holder);
      if (result.ok) {
        sent += 1;
      } else {
        failed.push({
          userId: holder.userId,
          name: holder.user.name,
          email: holder.user.email,
          reason: result.reason,
        });
      }
    }

    if (sent || failed.length) {
      this.logger.log(
        `Included material for "${session.product.title}": ${sent} sent, ${failed.length} failed`,
      );
    }

    return { attempted: targets.length, sent, failed };
  }

  /**
   * One buyer: grant, email, record the outcome.
   *
   * Never throws. A bad address or a mail provider having a bad minute must
   * not stop the rest of the list being served, and the reason is kept on the
   * row so the admin can see it and retry that person alone.
   */
  private async deliverTo(
    session: { productId: string; showNotSpamNotice: boolean; product: { title: string } },
    items: Array<{ id: string; title: string }>,
    holder: { userId: string; sourceOrderId: string | null; user: { name: string; email: string | null } },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const fail = async (reason: string) => {
      await this.recordDelivery(session.productId, holder.userId, BundleDeliveryStatus.FAILED, reason);
      return { ok: false as const, reason };
    };

    if (!holder.user.email) {
      return fail('This account has no email address.');
    }

    try {
      for (const item of items) {
        // Granting is idempotent, so a buyer who already owns the PDF — bought
        // separately, or granted before the mode was changed — keeps the copy
        // they have and this adds nothing.
        await this.entitlements.grant({
          userId: holder.userId,
          productId: item.id,
          source: EntitlementSource.BUNDLE,
          // Carried so a refund of the seat takes the material back with it,
          // exactly as it would have at payment.
          sourceOrderId: holder.sourceOrderId,
          sourceProductId: session.productId,
        });
      }
    } catch (error) {
      return fail(
        `Could not grant access: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const rendered = liveSessionBundleReady({
      attendeeName: firstName(holder.user.name),
      sessionTitle: session.product.title,
      includedTitles: items.map((item) => item.title),
      libraryUrl: `${this.config.get('STOREFRONT_URL').replace(/\/$/, '')}/library`,
      showNotSpamNotice: session.showNotSpamNotice,
    });

    const outcome = await this.mail.sendBestEffort({
      to: { email: holder.user.email, name: holder.user.name },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag: 'session-bundle-ready',
    });

    if (!outcome.delivered) {
      // The access was granted a moment ago and stays granted: the material is
      // in their library whether or not this email arrived. Recording FAILED
      // is about the notification, so a retry re-sends the mail and the grant
      // above simply finds itself already done.
      return fail(outcome.reason);
    }

    await this.recordDelivery(session.productId, holder.userId, BundleDeliveryStatus.SENT, null);
    return { ok: true };
  }

  private async recordDelivery(
    liveSessionId: string,
    userId: string,
    status: BundleDeliveryStatus,
    lastError: string | null,
  ): Promise<void> {
    const sentAt = status === BundleDeliveryStatus.SENT ? new Date() : null;

    await this.prisma.sessionBundleDelivery.upsert({
      where: { liveSessionId_userId: { liveSessionId, userId } },
      create: { liveSessionId, userId, status, lastError, sentAt, attempts: 1 },
      update: { status, lastError, sentAt, attempts: { increment: 1 } },
    });
  }

  /**
   * Releases included material for every session set to do it automatically.
   *
   * Runs on the reminder sweep's clock. Sessions that have not finished, or
   * whose material is not published yet, are the ordinary waiting states and
   * are skipped silently — they are what this is waiting *for*, not faults.
   * A failed delivery is simply not SENT, so the next tick retries it.
   */
  async sweepAutoBundleReleases() {
    const sessions = await this.prisma.liveSession.findMany({
      where: {
        bundleDeliveryMode: BundleDeliveryMode.AUTO_AFTER_SESSION,
        product: { status: ProductStatus.PUBLISHED, deletedAt: null },
      },
      select: { productId: true },
    });

    let sent = 0;
    let failed = 0;

    for (const session of sessions) {
      try {
        const result = await this.releaseBundle(session.productId);
        sent += result.sent;
        failed += result.failed.length;
      } catch (error) {
        // BadRequestException here means "not ready yet", which is expected.
        if (error instanceof BadRequestException) continue;

        this.logger.error(
          `Automatic release failed for session ${session.productId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { sessions: sessions.length, sent, failed };
  }

  // --- date announcements (admin-triggered "notify attendees") ---------------

  /**
   * Every seat holder and whether they have been told the dates.
   *
   * A buyer with no announcement row has simply never been notified, which is
   * PENDING. A buyer whose `announcedStartsAt` differs from the session's
   * current first day has been told about *old* dates and is shown as outdated
   * (effectively PENDING for the new date).
   */
  async listDateAnnouncements(sessionId: string): Promise<{
    blocker: SendBlocker;
    currentStartsAt: Date | null;
    rows: DateAnnouncementRow[];
  }> {
    const session = await this.prisma.liveSession.findUnique({
      where: { productId: sessionId },
      include: {
        days: { orderBy: { startsAt: 'asc' }, select: { startsAt: true } },
        product: { select: { title: true, status: true, deletedAt: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    const currentStartsAt = session.days[0]?.startsAt ?? null;

    const [holders, announcements] = await Promise.all([
      this.prisma.entitlement.findMany({
        where: { productId: sessionId, status: EntitlementStatus.ACTIVE },
        select: { userId: true, user: { select: { name: true, email: true } } },
      }),
      this.prisma.sessionDateAnnouncement.findMany({ where: { liveSessionId: sessionId } }),
    ]);

    const byUser = new Map(announcements.map((row) => [row.userId, row]));

    return {
      blocker: this.dateAnnouncementBlocker(session.days.length),
      currentStartsAt,
      rows: holders.map((holder) => {
        const row = byUser.get(holder.userId);
        // If the dates changed since the last announcement, treat as PENDING.
        const stale =
          row?.status === AnnouncementStatus.SENT &&
          currentStartsAt &&
          row.announcedStartsAt?.getTime() !== currentStartsAt.getTime();
        return {
          userId: holder.userId,
          name: holder.user.name,
          email: holder.user.email,
          status: stale ? AnnouncementStatus.PENDING : (row?.status ?? AnnouncementStatus.PENDING),
          lastError: row?.lastError ?? null,
          sentAt: stale ? null : (row?.sentAt ?? null),
          attempts: row?.attempts ?? 0,
        };
      }),
    };
  }

  /**
   * Send the date-announcement email to seat holders.
   *
   * `userIds` omitted → everyone whose row is not SENT for the current dates
   * (i.e. never told, told about old dates, or previously failed). Anyone
   * already SENT for the current dates is skipped, so this is safe to repeat.
   */
  async announceDates(
    sessionId: string,
    options: { userIds?: string[] } = {},
  ): Promise<{
    attempted: number;
    sent: number;
    failed: Array<{ userId: string; name: string; email: string | null; reason: string }>;
  }> {
    const session = await this.prisma.liveSession.findUnique({
      where: { productId: sessionId },
      include: {
        days: { orderBy: { startsAt: 'asc' } },
        product: { select: { title: true, status: true, deletedAt: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    const blocker = this.dateAnnouncementBlocker(session.days.length);
    if (blocker) throw new BadRequestException(blocker);

    const currentStartsAt = session.days[0]!.startsAt;
    const whenLines = sessionWhenLines(session.days);

    const holders = await this.prisma.entitlement.findMany({
      where: {
        productId: sessionId,
        status: EntitlementStatus.ACTIVE,
        ...(options.userIds?.length ? { userId: { in: options.userIds } } : {}),
      },
      select: { userId: true, user: { select: { name: true, email: true } } },
    });

    // Skip anyone already told about the current date.
    const alreadySent = new Set(
      (
        await this.prisma.sessionDateAnnouncement.findMany({
          where: {
            liveSessionId: sessionId,
            status: AnnouncementStatus.SENT,
            announcedStartsAt: currentStartsAt,
          },
          select: { userId: true },
        })
      ).map((row) => row.userId),
    );

    const targets = holders.filter((h) => !alreadySent.has(h.userId));

    let sent = 0;
    const failed: Array<{ userId: string; name: string; email: string | null; reason: string }> = [];

    for (const holder of targets) {
      const result = await this.sendDateAnnouncement(session, whenLines, currentStartsAt, holder);
      if (result.ok) {
        sent += 1;
      } else {
        failed.push({
          userId: holder.userId,
          name: holder.user.name,
          email: holder.user.email,
          reason: result.reason,
        });
      }
    }

    if (sent || failed.length) {
      activity(this.logger, 'session.dates_announced', {
        sessionId,
        sent,
        failed: failed.length,
        currentStartsAt: currentStartsAt.toISOString(),
      });
    }

    return { attempted: targets.length, sent, failed };
  }

  private dateAnnouncementBlocker(dayCount: number): SendBlocker {
    if (dayCount === 0) {
      return 'This session has no dates yet. Add dates in the session form first.';
    }
    return null;
  }

  private async sendDateAnnouncement(
    session: {
      productId: string;
      joinUrl: string | null;
      platformLabel: string;
      showNotSpamNotice: boolean;
      product: { title: string };
    },
    whenLines: string[],
    currentStartsAt: Date,
    holder: { userId: string; user: { name: string; email: string | null } },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const fail = async (reason: string) => {
      await this.recordDateAnnouncement(
        session.productId,
        holder.userId,
        AnnouncementStatus.FAILED,
        currentStartsAt,
        reason,
      );
      return { ok: false as const, reason };
    };

    if (!holder.user.email) {
      return fail('This account has no email address.');
    }

    const rendered = liveSessionDatesAnnounced({
      attendeeName: firstName(holder.user.name),
      sessionTitle: session.product.title,
      whenLines,
      platformLabel: session.platformLabel,
      joinUrl: session.joinUrl,
      showNotSpamNotice: session.showNotSpamNotice,
    });

    const outcome = await this.mail.sendBestEffort({
      to: { email: holder.user.email, name: holder.user.name },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag: 'session-dates-announced',
    });

    if (!outcome.delivered) {
      return fail(outcome.reason);
    }

    await this.recordDateAnnouncement(
      session.productId,
      holder.userId,
      AnnouncementStatus.SENT,
      currentStartsAt,
      null,
    );
    return { ok: true };
  }

  private async recordDateAnnouncement(
    liveSessionId: string,
    userId: string,
    status: AnnouncementStatus,
    announcedStartsAt: Date,
    lastError: string | null,
  ): Promise<void> {
    const sentAt = status === AnnouncementStatus.SENT ? new Date() : null;

    await this.prisma.sessionDateAnnouncement.upsert({
      where: { liveSessionId_userId: { liveSessionId, userId } },
      create: { liveSessionId, userId, status, announcedStartsAt, lastError, sentAt, attempts: 1 },
      update: { status, announcedStartsAt, lastError, sentAt, attempts: { increment: 1 } },
    });
  }
}
