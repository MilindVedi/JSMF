import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AssetKind, EntitlementSource, EntitlementStatus, Prisma, ProductType } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { activity } from '../../../shared/logging/activity';
import { MailService } from '../../../shared/mail/application/mail.service';
import { liveSessionMaterials } from '../../../shared/mail/templates/mail-templates';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { EntitlementService } from '../../entitlements/application/entitlement.service';
import {
  OrderEvents,
  type OrderPaidEvent,
  type OrderPaidListener,
} from '../../orders/application/order-events';
import { desiredAccess, entitledToDay } from '../domain/session-materials';
import { firstName, sessionDisplayName } from '../domain/session-display';

type Db = PrismaService | Prisma.TransactionClient;

export interface SessionMaterialRow {
  userId: string;
  name: string;
  email: string | null;
  joinedAt: Date;
  /** Materials this person is entitled to, by material id. */
  entitled: string[];
  /** Entitled and not yet emailed about — what a send would carry. */
  outstanding: string[];
  lastSentAt: Date | null;
  lastError: string | null;
}

/**
 * PDFs attached to the days of a live session, and who gets them.
 *
 * Access is entitlements, the platform's one answer to "may this person have
 * this file": `reconcile` makes the SESSION_MATERIAL grants match the rule
 * (`domain/session-materials.ts`) — granting what is due and taking back what
 * no longer is. It is idempotent and runs whenever an input changes: a
 * material added or removed, the late-joiner setting changed, a seat paid for
 * (OrderEvents) or recorded by hand (the offline-sale handler), and on the
 * 5-minute sweep as a safety net. The library and downloads need no changes:
 * a material is an ordinary PDF the person holds.
 *
 * Emails are separate and only on the admin's say-so, tracked per person and
 * material in `session_material_notices`. Access never depends on them.
 */
@Injectable()
export class SessionMaterialsService implements OrderPaidListener, OnModuleInit {
  private readonly logger = new Logger(SessionMaterialsService.name);
  /** One send per session at a time, so a double click cannot email twice. */
  private readonly sending = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly orderEvents: OrderEvents,
    private readonly sweeps: SweepRegistry,
  ) {}

  onModuleInit(): void {
    this.orderEvents.register(this);
    this.sweeps.register({ name: 'sessionMaterials', run: () => this.reconcileAll() });
  }

  /** A new seat: give it the materials it is due. Never takes over the confirmation email. */
  async onOrderPaid(event: OrderPaidEvent): Promise<{ confirmationHandled: boolean }> {
    for (const item of event.items) {
      if (item.productType === ProductType.LIVE_SESSION) await this.reconcile(item.productId);
    }
    return { confirmationHandled: false };
  }

  // --- admin ------------------------------------------------------------------

  async overview(sessionId: string) {
    await this.reconcile(sessionId);
    const session = await this.load(sessionId);
    const holders = await this.seatHolders(this.prisma, sessionId);
    const notices = await this.prisma.sessionMaterialNotice.findMany({
      where: { material: { liveSessionId: sessionId } },
    });
    const noticeOf = new Map(notices.map((n) => [`${n.materialId}:${n.userId}`, n]));

    const days = session.days.map((day, index) => ({
      id: day.id,
      number: index + 1,
      startsAt: day.startsAt,
      durationMinutes: day.durationMinutes,
      materials: session.materials
        .filter((m) => m.dayId === day.id)
        .map((m) => ({
          id: m.id,
          productId: m.productId,
          title: m.product.title,
          listed: m.product.listed,
          status: m.product.status,
          addedAt: m.createdAt,
        })),
    }));

    const rows: SessionMaterialRow[] = holders.map((holder) => {
      const entitled = session.materials
        .filter((m) => entitledToDay(m.day, holder.grantedAt, session.lateJoinersGetEarlierMaterials))
        .map((m) => m.id);
      const mine = entitled
        .map((id) => noticeOf.get(`${id}:${holder.userId}`))
        .filter((n): n is NonNullable<typeof n> => n !== undefined);
      const sentTimes = mine.map((n) => n.sentAt).filter((d): d is Date => d !== null);
      const failure = mine.find((n) => n.sentAt === null && n.lastError);
      return {
        userId: holder.userId,
        name: holder.user.name,
        email: holder.user.email,
        joinedAt: holder.grantedAt,
        entitled,
        outstanding: entitled.filter((id) => !noticeOf.get(`${id}:${holder.userId}`)?.sentAt),
        lastSentAt: sentTimes.length ? new Date(Math.max(...sentTimes.map((d) => d.getTime()))) : null,
        lastError: failure?.lastError ?? null,
      };
    });

    return {
      lateJoinersGetEarlierMaterials: session.lateJoinersGetEarlierMaterials,
      days,
      needingEmail: rows.filter((r) => r.outstanding.length > 0).length,
      rows,
    };
  }

  /** Attaches a store PDF to one day, and gives it to everyone due it. */
  async add(
    sessionId: string,
    input: { dayId: string; productId: string },
    actor: { id: string; ip?: string | null },
  ) {
    const session = await this.load(sessionId);
    if (!session.days.some((d) => d.id === input.dayId)) {
      throw new BadRequestException('That day is not part of this session.');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: {
        id: true,
        type: true,
        title: true,
        assets: { where: { kind: AssetKind.PRIMARY_FILE, isCurrent: true }, select: { id: true } },
      },
    });
    if (!product) throw new NotFoundException('That PDF was not found, or it is archived.');
    if (product.type !== ProductType.PDF) throw new BadRequestException('Only PDFs from the store can be attached.');
    if (product.assets.length === 0) {
      throw new BadRequestException(`"${product.title}" has no PDF uploaded yet. Upload its file in the store first.`);
    }

    const position = await this.prisma.sessionMaterial.count({ where: { dayId: input.dayId } });
    try {
      const material = await this.prisma.sessionMaterial.create({
        data: {
          liveSessionId: sessionId,
          dayId: input.dayId,
          productId: product.id,
          sortOrder: position,
          addedById: actor.id,
        },
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'session_material.added',
        entityType: 'session_material',
        entityId: material.id,
        after: material,
        ip: actor.ip,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`"${product.title}" is already on that day.`);
      }
      throw error;
    }

    const result = await this.reconcile(sessionId);
    activity(this.logger, 'session.material_added', { sessionId, productId: product.id, ...result });
    return this.overview(sessionId);
  }

  /** Detaches a material; access given only through it is taken back. */
  async remove(sessionId: string, materialId: string, actor: { id: string; ip?: string | null }) {
    const material = await this.prisma.sessionMaterial.findFirst({
      where: { id: materialId, liveSessionId: sessionId },
    });
    if (!material) throw new NotFoundException('That material is not on this session.');

    await this.prisma.sessionMaterial.delete({ where: { id: materialId } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'session_material.removed',
      entityType: 'session_material',
      entityId: materialId,
      before: material,
      ip: actor.ip,
    });

    const result = await this.reconcile(sessionId);
    activity(this.logger, 'session.material_removed', { sessionId, productId: material.productId, ...result });
    return this.overview(sessionId);
  }

  /**
   * Emails each chosen seat holder about the materials they have not been told
   * about yet — one email per person. Omit userIds for everyone; anyone with
   * nothing new is skipped, so pressing twice sends nothing more.
   */
  async send(sessionId: string, options: { userIds?: string[] } = {}) {
    if (this.sending.has(sessionId)) {
      throw new ConflictException('This is already being sent. Wait for it to finish, then check the table.');
    }
    this.sending.add(sessionId);

    try {
      const overview = await this.overview(sessionId);
      const session = await this.load(sessionId);
      if (session.materials.length === 0) throw new BadRequestException('No materials have been added yet.');

      const wanted = options.userIds?.length ? new Set(options.userIds) : null;
      const materialById = new Map(session.materials.map((m) => [m.id, m]));
      const dayNumber = new Map(session.days.map((d, i) => [d.id, i + 1]));
      const multiDay = session.days.length > 1;
      const libraryUrl = `${this.config.get('STOREFRONT_URL').replace(/\/$/, '')}/library`;

      let sent = 0;
      let nothingNew = 0;
      const failed: Array<{ userId: string; name: string; email: string | null; reason: string }> = [];

      for (const row of overview.rows) {
        if (wanted && !wanted.has(row.userId)) continue;
        if (row.outstanding.length === 0) {
          nothingNew += 1;
          continue;
        }

        const items = row.outstanding
          .map((id) => materialById.get(id)!)
          .sort((a, b) => dayNumber.get(a.dayId)! - dayNumber.get(b.dayId)! || a.sortOrder - b.sortOrder);
        const days: Array<{ dayLabel: string; titles: string[] }> = [];
        for (const item of items) {
          const label = multiDay ? `Day ${dayNumber.get(item.dayId)}` : 'Session';
          const last = days[days.length - 1];
          if (last?.dayLabel === label) last.titles.push(item.product.title);
          else days.push({ dayLabel: label, titles: [item.product.title] });
        }

        let outcome: { delivered: true } | { delivered: false; reason: string };
        if (!row.email) {
          outcome = { delivered: false, reason: 'This account has no email address.' };
        } else {
          const rendered = liveSessionMaterials({
            attendeeName: firstName(row.name),
            sessionTitle: sessionDisplayName(session),
            days,
            libraryUrl,
            showNotSpamNotice: session.showNotSpamNotice,
          });
          outcome = await this.mail.sendBestEffort({
            to: { email: row.email, name: row.name },
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
            tag: 'session-materials',
          });
        }

        await this.recordNotices(row.userId, row.outstanding, outcome.delivered ? null : outcome.reason);
        if (outcome.delivered) sent += 1;
        else failed.push({ userId: row.userId, name: row.name, email: row.email, reason: outcome.reason });
      }

      activity(this.logger, 'session.materials_sent', {
        sessionId,
        sent,
        nothingNew,
        failed: failed.length,
        selected: options.userIds?.length,
      });
      return { attempted: sent + failed.length, sent, nothingNew, failed };
    } finally {
      this.sending.delete(sessionId);
    }
  }

  // --- access -------------------------------------------------------------------

  /**
   * Makes this session's SESSION_MATERIAL grants match the rule. Revokes first,
   * then grants what is missing. A person who already holds the PDF some other
   * way (they bought it) is left alone — their own entitlement covers them, and
   * nothing here ever touches an entitlement it did not create.
   */
  async reconcile(sessionId: string, tx?: Prisma.TransactionClient): Promise<{ granted: number; revoked: number }> {
    const db: Db = tx ?? this.prisma;
    const session = await db.liveSession.findUnique({
      where: { productId: sessionId },
      select: {
        lateJoinersGetEarlierMaterials: true,
        materials: {
          where: { product: { deletedAt: null } },
          select: { productId: true, day: { select: { startsAt: true, durationMinutes: true } } },
        },
      },
    });
    if (!session) return { granted: 0, revoked: 0 };

    const holders = await this.seatHolders(db, sessionId);
    const desired = desiredAccess(
      holders.map((h) => ({ userId: h.userId, joinedAt: h.grantedAt, sourceOrderId: h.sourceOrderId })),
      session.materials,
      session.lateJoinersGetEarlierMaterials,
    );

    const ours = await db.entitlement.findMany({
      where: {
        source: EntitlementSource.SESSION_MATERIAL,
        sourceProductId: sessionId,
        status: EntitlementStatus.ACTIVE,
      },
      select: { id: true, userId: true, productId: true },
    });
    let revoked = 0;
    for (const grant of ours) {
      if (desired.get(grant.userId)?.productIds.has(grant.productId)) continue;
      await this.entitlements.revoke(grant.id, 'No longer part of this session', tx);
      revoked += 1;
    }

    const productIds = [...new Set(session.materials.map((m) => m.productId))];
    if (productIds.length === 0 || holders.length === 0) return { granted: 0, revoked };

    const held = await db.entitlement.findMany({
      where: {
        userId: { in: holders.map((h) => h.userId) },
        productId: { in: productIds },
        status: EntitlementStatus.ACTIVE,
      },
      select: { userId: true, productId: true },
    });
    const has = new Set(held.map((e) => `${e.userId}:${e.productId}`));

    let granted = 0;
    for (const { holder, productIds: due } of desired.values()) {
      for (const productId of due) {
        if (has.has(`${holder.userId}:${productId}`)) continue;
        await this.entitlements.grant(
          {
            userId: holder.userId,
            productId,
            source: EntitlementSource.SESSION_MATERIAL,
            // The seat's order: refunding the seat takes these back with it.
            sourceOrderId: holder.sourceOrderId,
            sourceProductId: sessionId,
          },
          tx,
        );
        granted += 1;
      }
    }
    return { granted, revoked };
  }

  /** The sweep: every session that has materials. Catches anything an event missed. */
  async reconcileAll() {
    const sessions = await this.prisma.sessionMaterial.findMany({
      distinct: ['liveSessionId'],
      select: { liveSessionId: true },
    });
    let granted = 0;
    let revoked = 0;
    for (const { liveSessionId } of sessions) {
      const result = await this.reconcile(liveSessionId);
      granted += result.granted;
      revoked += result.revoked;
    }
    return { sessions: sessions.length, granted, revoked };
  }

  // --- internals ----------------------------------------------------------------

  private async recordNotices(userId: string, materialIds: string[], error: string | null) {
    const now = new Date();
    const lastError = error?.slice(0, 500) ?? null;
    try {
      await this.prisma.$transaction(
        materialIds.map((materialId) =>
          this.prisma.sessionMaterialNotice.upsert({
            where: { materialId_userId: { materialId, userId } },
            create: { materialId, userId, sentAt: error ? null : now, lastError, attempts: 1 },
            update: { ...(error ? {} : { sentAt: now }), lastError, attempts: { increment: 1 } },
          }),
        ),
      );
    } catch (cause) {
      // Bookkeeping only: the email has already gone (or failed) either way.
      this.logger.error(
        `Could not record material notices for ${userId}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  private async load(sessionId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { productId: sessionId },
      include: {
        days: { orderBy: { startsAt: 'asc' } },
        product: { select: { title: true } },
        materials: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            day: { select: { startsAt: true, durationMinutes: true } },
            product: { select: { title: true, listed: true, status: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /** Everyone holding a seat now. When they got it is when they "joined". */
  private seatHolders(db: Db, sessionId: string) {
    return db.entitlement.findMany({
      where: { productId: sessionId, status: EntitlementStatus.ACTIVE },
      orderBy: { grantedAt: 'asc' },
      select: {
        userId: true,
        grantedAt: true,
        sourceOrderId: true,
        user: { select: { name: true, email: true } },
      },
    });
  }
}
