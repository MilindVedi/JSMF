import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { BundleDeliveryMode, EntitlementStatus, Prisma, ProductStatus, ProductType } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  OfflineSaleHandlers,
  type OfflineSaleContext,
  type OfflineSaleHandler,
} from '../../orders/application/offline-sale-handlers';
import { EXAM_OPTIONS, STAGE_OPTIONS } from '../domain/session-display';
import { SessionMaterialsService } from './session-materials.service';

const DETAIL_KEYS = new Set(['exam', 'stage']);

/**
 * What a live session adds to a seat sold outside checkout: the registration
 * row. The day reminder reads a registration joined to an active entitlement,
 * so a seat without one would be silently left out of the one email that
 * carries the joining link.
 *
 * Exam and stage are optional here. Buyers who paid by hand were never asked;
 * left out, the registration holds an empty answer, shown blank in admin.
 */
@Injectable()
export class SessionOfflineSaleHandler implements OfflineSaleHandler, OnModuleInit {
  readonly productType = ProductType.LIVE_SESSION;

  constructor(
    private readonly prisma: PrismaService,
    private readonly handlers: OfflineSaleHandlers,
    private readonly config: AppConfig,
    // Optional so the terminal script, which builds this handler by hand,
    // keeps working; there the 5-minute sweep gives the materials instead.
    @Optional() private readonly materials?: SessionMaterialsService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(this);
  }

  validateDetails(details: Record<string, unknown>) {
    const errors: string[] = [];
    const clean: Record<string, unknown> = {};

    for (const key of Object.keys(details)) {
      if (!DETAIL_KEYS.has(key)) errors.push(`"${key}" is not a field this list understands.`);
    }

    const exam = optionalText(details.exam);
    if (exam !== null) {
      if ((EXAM_OPTIONS as readonly string[]).includes(exam)) clean.exam = exam;
      else errors.push(`exam must be one of ${EXAM_OPTIONS.join(', ')} (or left out).`);
    }
    const stage = optionalText(details.stage);
    if (stage !== null) {
      if ((STAGE_OPTIONS as readonly string[]).includes(stage)) clean.stage = stage;
      else errors.push(`stage must be one of ${STAGE_OPTIONS.join(', ')} (or left out).`);
    }

    return { details: clean, errors };
  }

  async grantsIncludedItemsNow(productId: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const session = await tx.liveSession.findUnique({
      where: { productId },
      select: { bundleDeliveryMode: true },
    });
    // Checkout grants included items at payment only in IMMEDIATE mode; the
    // deferred modes release them later to every seat holder, these included.
    return session?.bundleDeliveryMode === BundleDeliveryMode.IMMEDIATE;
  }

  async apply(context: OfflineSaleContext, tx: Prisma.TransactionClient): Promise<void> {
    const registration = {
      // Dated at the payment, so the admin's registration list — sorted by
      // this — shows them where they really paid.
      createdAt: context.paidAt,
      exam: typeof context.details.exam === 'string' ? context.details.exam : '',
      stage: typeof context.details.stage === 'string' ? context.details.stage : '',
      orderId: context.orderId,
      // Already confirmed: they were told in person when they paid. Null would
      // be a standing invitation for a future sweep to email them weeks late.
      confirmationSentAt: context.paidAt,
    };

    await tx.sessionRegistration.upsert({
      where: { liveSessionId_userId: { liveSessionId: context.productId, userId: context.userId } },
      create: {
        liveSessionId: context.productId,
        userId: context.userId,
        whatsappNumber: context.whatsappNumber,
        ...registration,
      },
      // Someone who opened the website's form before paying by hand already
      // has a registration with no seat; it is completed, not duplicated, and
      // a number already on it is kept when none was given.
      update: { ...registration, ...(context.whatsappNumber ? { whatsappNumber: context.whatsappNumber } : {}) },
    });

    // The day materials this seat is due, judged by when they really paid.
    await this.materials?.reconcile(context.productId, tx);
  }

  async warnings(productId: string, count: number): Promise<string[]> {
    if (count === 0) return [];

    const session = await this.prisma.liveSession.findUnique({
      where: { productId },
      select: {
        capacity: true,
        joinUrl: true,
        product: { select: { status: true } },
        days: { select: { startsAt: true } },
      },
    });
    if (!session) return [];

    const warnings: string[] = [];

    if (session.capacity !== null) {
      const taken = await this.prisma.entitlement.count({
        where: { productId, status: EntitlementStatus.ACTIVE },
      });
      if (taken + count > session.capacity) {
        warnings.push(
          `This brings the session to ${taken + count} seats, over its capacity of ${session.capacity}. ` +
            'The website will show it as full and refuse new buyers.',
        );
      }
    }

    const now = Date.now();
    const leadMs = this.config.get('SESSION_REMINDER_LEAD_MINUTES') * 60_000;
    const dayDueSoon = session.days.some(
      (day) => day.startsAt.getTime() > now && day.startsAt.getTime() - now <= leadMs,
    );
    if (dayDueSoon && session.joinUrl && session.product.status === ProductStatus.PUBLISHED) {
      warnings.push(
        'A session day starts soon: these buyers will get its reminder, with the joining link, within about 5 minutes.',
      );
    }

    return warnings;
  }

  async describe(productId: string, userIds: string[]) {
    const registrations = await this.prisma.sessionRegistration.findMany({
      where: { liveSessionId: productId, userId: { in: userIds } },
      select: { userId: true, exam: true, stage: true },
    });

    return new Map(
      registrations.map((row) => [
        row.userId,
        {
          ...(row.exam ? { Exam: row.exam } : {}),
          ...(row.stage ? { Stage: row.stage } : {}),
        },
      ]),
    );
  }
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
