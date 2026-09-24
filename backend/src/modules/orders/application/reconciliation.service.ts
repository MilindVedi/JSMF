import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfig } from '../../../config/config.module';
import { PaymentService } from './payment.service';

/**
 * Runs the payment reconciliation sweep on a timer.
 *
 * Deliberately thin: the sweep itself lives in `PaymentService`, so it can also
 * be triggered by an admin or a test without a clock. All this class decides is
 * *when*.
 *
 * In-process rather than a queue or a separate worker — V1 runs one API
 * container, and a cron that costs nothing to host is the right size for a job
 * that makes a handful of HTTP calls every few minutes. `PAYMENT_RECONCILIATION_ENABLED`
 * is the switch that turns it off if this ever moves to a dedicated worker,
 * which is also what a second API instance would need: the sweep would
 * otherwise run once per instance. Duplicate runs are harmless — `settle` is
 * idempotent — but they are wasted provider calls.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  /** Guards against a slow sweep overlapping the next tick. */
  private running = false;

  constructor(
    private readonly payments: PaymentService,
    private readonly config: AppConfig,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'payment-reconciliation' })
  async sweep(): Promise<void> {
    if (!this.config.get('PAYMENT_RECONCILIATION_ENABLED')) return;

    if (this.running) {
      this.logger.warn('Previous reconciliation sweep is still running — skipping this tick');
      return;
    }

    this.running = true;
    try {
      await this.payments.reconcile({
        staleAfterMinutes: this.config.get('PAYMENT_RECONCILIATION_STALE_AFTER_MINUTES'),
        giveUpAfterHours: this.config.get('PAYMENT_RECONCILIATION_GIVE_UP_AFTER_HOURS'),
        batchSize: this.config.get('PAYMENT_RECONCILIATION_BATCH_SIZE'),
      });
    } catch (error) {
      // A thrown error inside a scheduled job has nowhere to go but the logs,
      // and an unhandled rejection would take the process down with it.
      this.logger.error(
        `Reconciliation sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
