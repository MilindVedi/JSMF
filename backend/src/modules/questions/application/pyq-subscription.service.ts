import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IS_PYQ_PLAN } from '../../../shared/pyq-plan';
import { assertSubscriptionManagementEnabled, type Actor } from './subscription-management';

const SINGLETON_ID = 'global';
const SETTINGS_CACHE_KEY = 'pyq:subscription-settings';
/** Read on every /pyq/access; a change shows within this, or at once on this instance. */
const SETTINGS_TTL_SECONDS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What a missing row heals to — the same list the migration seeds. */
export const DEFAULT_PLAN_FEATURES = [
  'Unlimited practice across all 3 exams',
  'All 19 subjects, last 5 years',
  'Timed custom tests & full statistics',
  'Early access to new question drops',
  'Priority support',
];

export interface SubscriptionSettings {
  trialEnabled: boolean;
  trialDays: number;
  /** The benefits every plan card shows. Plans differ only in length and price. */
  features: string[];
}

export interface TrialView {
  startedAt: string;
  endsAt: string;
  days: number;
}

type SettingsClient = Pick<PrismaService, 'pyqSubscriptionSettings'> | Prisma.TransactionClient;

/**
 * The free trial and the benefits list every plan shares.
 *
 * A trial is full plan access for a fixed number of days, started by the
 * student (never automatically), once per account, and only by someone who
 * has never held a plan. "Once" is the primary key on `pyq.trials.user_id`,
 * not a check in this code, so two requests racing cannot both win.
 */
@Injectable()
export class PyqSubscriptionService {
  private readonly logger = new Logger(PyqSubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly config: AppConfig,
  ) {}

  settings(): Promise<SubscriptionSettings> {
    return this.cache.wrap(SETTINGS_CACHE_KEY, SETTINGS_TTL_SECONDS, async () => toView(await this.row()));
  }

  /** Admin only, and only while SUBSCRIPTION_MANAGEMENT_ENABLED. Partial: omitted fields stay as they are. */
  async updateSettings(input: Partial<SubscriptionSettings>, actor: Actor): Promise<SubscriptionSettings> {
    assertSubscriptionManagementEnabled(this.config);

    const data: Prisma.PyqSubscriptionSettingsUpdateInput = {};
    if (input.trialEnabled !== undefined) data.trialEnabled = input.trialEnabled;
    if (input.trialDays !== undefined) data.trialDays = input.trialDays;
    if (input.features !== undefined) data.features = normaliseFeatures(input.features);

    const row = await this.prisma.$transaction(async (tx) => {
      const before = await this.row(tx);
      const after = await tx.pyqSubscriptionSettings.update({ where: { id: SINGLETON_ID }, data });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: 'pyq.subscription_settings_updated',
          entityType: 'pyq_subscription_settings',
          entityId: SINGLETON_ID,
          before: toView(before),
          after: toView(after),
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    await this.cache.del(SETTINGS_CACHE_KEY);
    return toView(row);
  }

  /** The trial running right now, if any. */
  async activeTrial(userId: string, now = new Date()): Promise<TrialView | null> {
    const trial = await this.prisma.pyqTrial.findUnique({ where: { userId } });
    return trial && trial.endsAt > now ? trialView(trial) : null;
  }

  /**
   * The trial this student could start right now, or null. Null while trials
   * are off, and for anyone who has had a trial or held any plan — bought,
   * gifted, expired or refunded — because a trial is for trying, not for
   * topping up.
   */
  async offerFor(userId: string): Promise<{ days: number } | null> {
    const settings = await this.settings();
    if (!settings.trialEnabled) return null;
    return (await this.eligible(userId)) ? { days: settings.trialDays } : null;
  }

  /**
   * Starts the student's one trial. Every rule is checked again here rather
   * than trusted from the offer the page was shown: the page may be stale,
   * and the request may not come from the page at all.
   */
  async startTrial(userId: string, now = new Date()): Promise<TrialView> {
    // Read fresh, not cached: an admin who just turned trials off must not
    // see one start a minute later on another instance.
    const settings = toView(await this.row());
    if (!settings.trialEnabled) {
      throw new ConflictException({ code: 'PYQ_TRIAL_UNAVAILABLE', message: 'Free trials are not available right now.' });
    }
    if (!(await this.eligible(userId))) {
      throw new ConflictException({
        code: 'PYQ_TRIAL_NOT_ELIGIBLE',
        message: 'A free trial is only for students who have not had one or held a plan before.',
      });
    }

    try {
      const trial = await this.prisma.pyqTrial.create({
        data: {
          userId,
          startedAt: now,
          endsAt: new Date(now.getTime() + settings.trialDays * DAY_MS),
          days: settings.trialDays,
        },
      });
      activity(this.logger, 'pyq.trial_started', { userId, days: trial.days, endsAt: trial.endsAt.toISOString() });
      return trialView(trial);
    } catch (error) {
      // The primary key: a second request that passed the checks alongside the first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'PYQ_TRIAL_NOT_ELIGIBLE', message: 'You have already used your free trial.' });
      }
      throw error;
    }
  }

  // --- internals ----------------------------------------------------------------

  private async eligible(userId: string): Promise<boolean> {
    const [trial, plan] = await Promise.all([
      this.prisma.pyqTrial.findUnique({ where: { userId }, select: { userId: true } }),
      this.prisma.entitlement.findFirst({ where: { userId, product: IS_PYQ_PLAN }, select: { id: true } }),
    ]);
    return !trial && !plan;
  }

  /** Upserts so a missing row heals instead of failing every /pyq/access. */
  private row(client: SettingsClient = this.prisma) {
    return client.pyqSubscriptionSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, features: DEFAULT_PLAN_FEATURES },
      update: {},
    });
  }
}

function toView(row: { trialEnabled: boolean; trialDays: number; features: string[] }): SubscriptionSettings {
  return { trialEnabled: row.trialEnabled, trialDays: row.trialDays, features: [...row.features] };
}

function trialView(trial: { startedAt: Date; endsAt: Date; days: number }): TrialView {
  return { startedAt: trial.startedAt.toISOString(), endsAt: trial.endsAt.toISOString(), days: trial.days };
}

/** Trimmed, inner whitespace collapsed, blanks and repeats dropped (first wins). Bounds are the DTO's. */
export function normaliseFeatures(features: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of features) {
    const feature = raw.trim().replace(/\s+/g, ' ');
    const key = feature.toLowerCase();
    if (!feature || seen.has(key)) continue;
    seen.add(key);
    out.push(feature);
  }
  return out;
}
