import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntitlementStatus, Prisma, SessionDetailEmailStatus, SessionDetailSource } from '@prisma/client';
import { activity } from '../../../shared/logging/activity';
import { MailService } from '../../../shared/mail/application/mail.service';
import { liveSessionDetails } from '../../../shared/mail/templates/mail-templates';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  currentDetailValues,
  detailStatuses,
  outstandingDetails,
  SESSION_DETAILS,
  valuesToRecord,
  type DetailStatus,
  type DetailValues,
  type SessionDetail,
} from '../domain/session-details';
import { firstName, sessionWhenLines } from '../domain/session-display';

export interface SessionDetailRow {
  userId: string;
  name: string;
  email: string | null;
  statuses: Record<SessionDetail, DetailStatus>;
  /** What a send would email them now. Empty = up to date. */
  outstanding: SessionDetail[];
  lastEmail: { status: SessionDetailEmailStatus; at: Date; error: string | null; items: SessionDetail[] } | null;
}

export interface SessionDetailsOverview {
  current: {
    datesSet: boolean;
    whenLines: string[];
    joinLink: string | null;
    telegram: string | null;
  };
  /** Per detail, how many seat holders need it: never sent, or changed since. */
  summary: Record<SessionDetail, { notSent: number; changed: number }>;
  /** Seat holders who need at least one detail. */
  needingAnything: number;
  /** Why nothing can be sent at all, or null. */
  blocker: string | null;
  rows: SessionDetailRow[];
}

type SessionForDetails = Prisma.LiveSessionGetPayload<{
  include: { days: true; product: { select: { title: true } } };
}>;

/**
 * Which session details (dates, joining link, Telegram group) each seat holder
 * still needs, and the email that sends exactly those.
 *
 * Every email that carries a detail records it — the confirmation, the
 * reminder, and the details email here — through `recordReceived`, so the
 * admin's table reflects what people actually got, whichever email it came in.
 * The details email also writes a row to `session_detail_emails`: the history
 * of what was sent to whom, and why a send failed.
 */
@Injectable()
export class SessionDetailsService {
  private readonly logger = new Logger(SessionDetailsService.name);
  /** Sessions with a send in progress on this instance — a second press waits for the first to finish. */
  private readonly sending = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async overview(sessionId: string): Promise<SessionDetailsOverview> {
    const session = await this.load(sessionId);
    const current = currentDetailValues(session);

    const [holders, receipts, emails] = await Promise.all([
      this.seatHolders(sessionId),
      this.prisma.sessionDetailReceipt.findMany({ where: { liveSessionId: sessionId } }),
      this.prisma.sessionDetailEmail.findMany({
        where: { liveSessionId: sessionId },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, status: true, createdAt: true, error: true, items: true },
      }),
    ]);

    const receivedBy = groupReceipts(receipts);
    const lastEmailBy = new Map<string, (typeof emails)[number]>();
    for (const email of emails) if (!lastEmailBy.has(email.userId)) lastEmailBy.set(email.userId, email);

    const summary = Object.fromEntries(SESSION_DETAILS.map((d) => [d, { notSent: 0, changed: 0 }])) as SessionDetailsOverview['summary'];
    let needingAnything = 0;

    const rows = holders.map((holder): SessionDetailRow => {
      const statuses = detailStatuses(current, receivedBy.get(holder.userId) ?? {});
      const outstanding = outstandingDetails(statuses);
      for (const detail of outstanding) {
        if (statuses[detail] === 'NOT_SENT') summary[detail].notSent += 1;
        else summary[detail].changed += 1;
      }
      if (outstanding.length > 0) needingAnything += 1;

      const email = lastEmailBy.get(holder.userId);
      return {
        userId: holder.userId,
        name: holder.user.name,
        email: holder.user.email,
        statuses,
        outstanding,
        lastEmail: email
          ? {
              status: email.status,
              at: email.createdAt,
              error: email.error,
              // Canonical order: the database returns a JSON object's keys reordered.
              items: SESSION_DETAILS.filter((detail) => detail in (email.items as Record<string, unknown>)),
            }
          : null,
      };
    });

    return {
      current: {
        datesSet: current.dates !== null,
        whenLines: sessionWhenLines(session.days),
        joinLink: current.join_link,
        telegram: current.telegram,
      },
      summary,
      needingAnything,
      blocker: blockerFor(current),
      rows,
    };
  }

  /**
   * Emails each seat holder whatever they still need — or only the people in
   * `userIds`. Anyone up to date is skipped, so this is safe to press twice.
   */
  async send(sessionId: string, options: { userIds?: string[]; sentById?: string | null } = {}) {
    if (this.sending.has(sessionId)) {
      throw new ConflictException('These details are already being sent. Wait for that to finish, then check the table.');
    }
    this.sending.add(sessionId);

    try {
      const session = await this.load(sessionId);
      const current = currentDetailValues(session);
      const blocker = blockerFor(current);
      if (blocker) throw new BadRequestException(blocker);

      const holders = await this.seatHolders(sessionId, options.userIds);
      const receivedBy = groupReceipts(
        await this.prisma.sessionDetailReceipt.findMany({
          where: { liveSessionId: sessionId, userId: { in: holders.map((h) => h.userId) } },
        }),
      );

      let sent = 0;
      let upToDate = 0;
      const failed: Array<{ userId: string; name: string; email: string | null; reason: string }> = [];

      for (const holder of holders) {
        const received = receivedBy.get(holder.userId) ?? {};
        const statuses = detailStatuses(current, received);
        const needed = outstandingDetails(statuses);
        if (needed.length === 0) {
          upToDate += 1;
          continue;
        }

        const outcome = await this.sendOne(session, current, holder, needed, statuses, options.sentById ?? null);
        if (outcome.ok) sent += 1;
        else failed.push({ userId: holder.userId, name: holder.user.name, email: holder.user.email, reason: outcome.reason });
      }

      activity(this.logger, 'session.details_sent', {
        sessionId,
        sent,
        upToDate,
        failed: failed.length,
        selected: options.userIds?.length,
      });

      return { attempted: sent + failed.length, sent, upToDate, failed };
    } finally {
      this.sending.delete(sessionId);
    }
  }

  /**
   * Notes that an email carried these details to this attendee. Called by
   * every email that carries one; never throws — a bookkeeping failure must
   * not turn a delivered email into an error.
   */
  async recordReceived(
    sessionId: string,
    userId: string,
    values: Array<[SessionDetail, string]>,
    source: SessionDetailSource,
    at = new Date(),
  ): Promise<void> {
    if (values.length === 0) return;
    try {
      await this.prisma.$transaction(
        values.map(([item, value]) =>
          this.prisma.sessionDetailReceipt.upsert({
            where: { liveSessionId_userId_item: { liveSessionId: sessionId, userId, item } },
            create: { liveSessionId: sessionId, userId, item, value, source, receivedAt: at },
            update: { value, source, receivedAt: at },
          }),
        ),
      );
    } catch (cause) {
      this.logger.error(
        `Could not record ${values.map(([item]) => item).join(', ')} received by ${userId} for session ${sessionId}: ` +
          (cause instanceof Error ? cause.message : String(cause)),
      );
    }
  }

  // --- internals --------------------------------------------------------------

  private async sendOne(
    session: SessionForDetails,
    current: DetailValues,
    holder: { userId: string; user: { name: string; email: string | null } },
    needed: SessionDetail[],
    statuses: Record<SessionDetail, DetailStatus>,
    sentById: string | null,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const carried = valuesToRecord(current, needed);
    const items = Object.fromEntries(carried);

    const log = (status: SessionDetailEmailStatus, error: string | null) =>
      this.prisma.sessionDetailEmail.create({
        data: { liveSessionId: session.productId, userId: holder.userId, items, status, error, sentById },
      });

    if (!holder.user.email) {
      const reason = 'This account has no email address.';
      await log(SessionDetailEmailStatus.FAILED, reason);
      return { ok: false, reason };
    }

    const wants = new Set(needed);
    const rendered = liveSessionDetails({
      attendeeName: firstName(holder.user.name),
      sessionTitle: session.product.title,
      whenLines: sessionWhenLines(session.days),
      platformLabel: session.platformLabel,
      dates: wants.has('dates') ? { changed: statuses.dates === 'CHANGED' } : undefined,
      joinLink: wants.has('join_link') ? { url: current.join_link!, changed: statuses.join_link === 'CHANGED' } : undefined,
      telegram: wants.has('telegram') ? { url: current.telegram!, changed: statuses.telegram === 'CHANGED' } : undefined,
      joinLinkMissing: current.join_link === null,
      joinLinkPendingText: session.pendingJoinLinkText,
      showNotSpamNotice: session.showNotSpamNotice,
    });

    const outcome = await this.mail.sendBestEffort({
      to: { email: holder.user.email, name: holder.user.name },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag: 'session-details',
    });

    if (!outcome.delivered) {
      await log(SessionDetailEmailStatus.FAILED, outcome.reason);
      return { ok: false, reason: outcome.reason };
    }

    await log(SessionDetailEmailStatus.SENT, null);
    await this.recordReceived(session.productId, holder.userId, carried, SessionDetailSource.DETAILS_EMAIL);
    return { ok: true };
  }

  private async load(sessionId: string): Promise<SessionForDetails> {
    const session = await this.prisma.liveSession.findUnique({
      where: { productId: sessionId },
      include: { days: { orderBy: { startsAt: 'asc' } }, product: { select: { title: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /** Everyone holding a seat now — a refunded buyer is not listed and is never emailed. */
  private seatHolders(sessionId: string, userIds?: string[]) {
    return this.prisma.entitlement.findMany({
      where: {
        productId: sessionId,
        status: EntitlementStatus.ACTIVE,
        ...(userIds?.length ? { userId: { in: userIds } } : {}),
      },
      orderBy: { grantedAt: 'asc' },
      select: { userId: true, user: { select: { name: true, email: true } } },
    });
  }
}

function groupReceipts(receipts: Array<{ userId: string; item: string; value: string }>) {
  const byUser = new Map<string, Partial<Record<SessionDetail, string>>>();
  for (const receipt of receipts) {
    const entry = byUser.get(receipt.userId) ?? {};
    entry[receipt.item as SessionDetail] = receipt.value;
    byUser.set(receipt.userId, entry);
  }
  return byUser;
}

function blockerFor(current: DetailValues): string | null {
  return SESSION_DETAILS.every((detail) => current[detail] === null)
    ? 'There is nothing to send yet. Add the dates, a joining link or a Telegram link first.'
    : null;
}
