import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { InternalOnlyGuard } from '../../../common/guards/internal-only.guard';
import { LiveSessionNotifications } from '../application/live-session-notifications.service';

/**
 * The session sweeps' trigger, on the same external 5-minute clock and under
 * the same protection as /internal/reconcile-payments: `@Public` skips JWT
 * auth only, and Cloud Run IAM admits nothing but the scheduler's service
 * account. See ReconciliationController for the full reasoning.
 *
 * Two sweeps share this tick rather than taking a scheduler job each: both are
 * cheap, both are about a session reaching the people who paid for it, and a
 * second job would be a second thing to configure, grant and remember.
 */
@ApiExcludeController()
@Controller('internal')
// IAM alone is not enough: the frontends hold an admitted identity and proxy
// /api/* for the public. See InternalOnlyGuard.
@UseGuards(InternalOnlyGuard)
export class SessionReminderController {
  constructor(private readonly notifications: LiveSessionNotifications) {}

  @Post('session-reminders')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  async trigger() {
    // Sequential, not Promise.all: both write, and a sweep that has to wait a
    // moment is worth more than two of them contending for the same rows.
    const reminders = await this.notifications.sendDueReminders();
    const bundles = await this.notifications.sweepAutoBundleReleases();

    return { reminders, bundles };
  }
}
