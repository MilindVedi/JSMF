import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfig } from '../../../config/config.module';
import { PaymentService } from './payment.service';

/**
 * Runs the payment reconciliation sweep.
 *
 * Deliberately thin: the sweep itself lives in `PaymentService`, so it can also
 * be triggered by an admin or a test without a clock. All this class decides is
 * *when* — and, since `PAYMENT_RECONCILIATION_TRIGGER`, whether the clock is
 * even ours.
 *
 * ## Why there are two triggers
 *
 * An in-process timer needs a process. On Cloud Run with `min-instances=0`
 * there is none between bursts of traffic, so a `@Cron` has nothing to fire in;
 * and with CPU throttling the little that does exist is frozen outside a
 * request. Production evidence: the sweep fired 8 times in 24 hours instead of
 * ~288, and every one of those failed to reach the database, because a
 * throttled container cannot hold a connection open either.
 *
 * That is the worst possible shape for this particular job. Reconciliation is
 * the control that catches a payment the provider took but never told us
 * about — a webhook that was never delivered, or a buyer who closed the tab
 * before the browser callback ran. It only matters when traffic is *thin*,
 * which is exactly when a scaled-to-zero service is asleep.
 *
 * So the schedule moves outside the service, to something that is awake whether
 * or not we are, and arrives as an ordinary HTTP request — which wakes the
 * container, unthrottles it, and gives the sweep a normal request lifetime to
 * run in. In `http` mode Cloud Scheduler is that clock.
 *
 * The in-process timer stays for local development and Docker Compose, where a
 * long-lived container makes it the simpler thing and nobody wants to run a
 * scheduler to test a sweep. Both paths call the same `run()`.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  /** Guards against a slow sweep overlapping the next trigger. */
  private running = false;

  constructor(
    private readonly payments: PaymentService,
    private readonly config: AppConfig,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'payment-reconciliation' })
  async scheduledSweep(): Promise<void> {
    // Registered unconditionally — @Cron is read at class-decoration time, long
    // before config — so the mode is checked per tick instead. In `http` mode
    // this is a no-op that costs a boolean every five minutes.
    if (this.config.get('PAYMENT_RECONCILIATION_TRIGGER') !== 'cron') return;

    await this.run('cron');
  }

  /**
   * The sweep itself. Never throws: a scheduled job has nowhere to put an
   * error but the logs, and the HTTP trigger must answer its caller rather
   * than hand a stack trace to a scheduler that will only retry it.
   *
   * @returns whether a sweep actually ran, so the HTTP trigger can tell a
   *   skipped tick from a completed one instead of reporting every call a
   *   success.
   */
  async run(source: 'cron' | 'http'): Promise<{ ran: boolean; reason?: string }> {
    if (!this.config.get('PAYMENT_RECONCILIATION_ENABLED')) {
      return { ran: false, reason: 'disabled' };
    }

    if (this.running) {
      this.logger.warn('Previous reconciliation sweep is still running — skipping this trigger');
      return { ran: false, reason: 'already-running' };
    }

    this.running = true;
    try {
      await this.payments.reconcile({
        staleAfterMinutes: this.config.get('PAYMENT_RECONCILIATION_STALE_AFTER_MINUTES'),
        giveUpAfterHours: this.config.get('PAYMENT_RECONCILIATION_GIVE_UP_AFTER_HOURS'),
        batchSize: this.config.get('PAYMENT_RECONCILIATION_BATCH_SIZE'),
      });
      return { ran: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconciliation sweep (${source}) failed: ${message}`);
      return { ran: false, reason: 'failed' };
    } finally {
      this.running = false;
    }
  }
}
