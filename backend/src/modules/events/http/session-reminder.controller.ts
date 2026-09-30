import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { LiveSessionNotifications } from '../application/live-session-notifications.service';

/**
 * The reminder sweep's trigger, on the same external 5-minute clock and under
 * the same protection as /internal/reconcile-payments: `@Public` skips JWT
 * auth only, and Cloud Run IAM admits nothing but the scheduler's service
 * account. See ReconciliationController for the full reasoning.
 */
@ApiExcludeController()
@Controller('internal')
export class SessionReminderController {
  constructor(private readonly notifications: LiveSessionNotifications) {}

  @Post('session-reminders')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  trigger() {
    return this.notifications.sendDueReminders();
  }
}
