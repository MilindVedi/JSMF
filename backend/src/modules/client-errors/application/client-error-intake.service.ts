import { Injectable, Logger } from '@nestjs/common';
import { isBotUserAgent } from '../../../common/net/user-agent';
import { AppConfig } from '../../../config/config.module';
import { activity } from '../../../shared/logging/activity';
import { errorReportFields } from '../../../shared/logging/error-reporting';
import {
  parseClientErrorBatch,
  reportLocationOf,
  reportMessageOf,
  serviceNameFor,
} from '../domain/client-error';
import { WindowBudget } from '../domain/window-budget';

export interface IntakeContext {
  /** Present only when the request carried a valid access token. */
  userId: string | null;
  userAgent: string | undefined;
}

/**
 * Turns crash reports from the websites and the phone app into log lines —
 * one `client.error` ERROR entry each, shaped as a Cloud Error Reporting
 * event so Error Reporting groups them per app and alerts on new ones.
 *
 * Nothing is stored in the database: Cloud Logging is the store, with its
 * retention, its access control (only project members can read it) and its
 * alerting. Never throws: the caller answers 204 whatever happens here.
 */
@Injectable()
export class ClientErrorIntakeService {
  private readonly logger = new Logger(ClientErrorIntakeService.name);
  private readonly budget: WindowBudget;

  constructor(private readonly config: AppConfig) {
    this.budget = new WindowBudget(config.get('CLIENT_ERRORS_MAX_PER_MINUTE'), 60_000);
  }

  /** How many errors were logged (for tests; the endpoint ignores it). */
  record(body: unknown, context: IntakeContext): number {
    try {
      if (!this.config.get('CLIENT_ERRORS_ENABLED')) return 0;
      if (isBotUserAgent(context.userAgent)) return 0;

      const batch = parseClientErrorBatch(body);
      if (!batch) return 0;

      const granted = this.budget.take(batch.errors.length);
      if (granted < batch.errors.length && this.budget.shouldWarn()) {
        // Once per minute at most, so the warning cannot become the flood.
        activity(this.logger, 'client.errors_dropped', { reason: 'instance budget reached' }, 'warn');
      }

      const service = { service: serviceNameFor(batch.app, batch.platform), version: batch.release ?? 'unknown' };
      const userAgent = context.userAgent?.slice(0, 200);

      for (const error of batch.errors.slice(0, granted)) {
        this.logger.error({
          activity: 'client.error',
          message: reportMessageOf(error),
          app: batch.app,
          platform: batch.platform,
          release: batch.release ?? undefined,
          kind: error.kind,
          errorName: error.name,
          page: error.page,
          digest: error.digest ?? undefined,
          count: error.count,
          userId: context.userId ?? undefined,
          ...errorReportFields(service, {
            httpRequest: { url: error.page, userAgent },
            user: context.userId ?? undefined,
            reportLocation: reportLocationOf(error),
          }),
        });
      }
      return granted;
    } catch (error) {
      activity(
        this.logger,
        'client.errors_failed',
        { error: error instanceof Error ? error.message : String(error) },
        'warn',
      );
      return 0;
    }
  }
}
