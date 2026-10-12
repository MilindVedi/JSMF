import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { activity } from '../../../shared/logging/activity';
import { deviceTypeFrom, isBotUserAgent, parseAnalyticsBatch } from '../domain/analytics-event';

export interface IngestContext {
  /** Present only when the request carried a valid access token. */
  userId: string | null;
  userAgent: string | undefined;
}

/**
 * Stores a batch of website events. Never throws: the caller answers 204
 * whatever happens here, because the page that sent the batch is not
 * listening and must behave identically whether this worked or not.
 */
@Injectable()
export class AnalyticsIngestService {
  private readonly logger = new Logger(AnalyticsIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** How many events were stored (for tests; the endpoint ignores it). */
  async ingest(body: unknown, context: IngestContext): Promise<number> {
    try {
      if (!this.config.get('ANALYTICS_ENABLED')) return 0;
      if (isBotUserAgent(context.userAgent)) return 0;

      const events = parseAnalyticsBatch(body);
      if (events.length === 0) return 0;

      const deviceType = deviceTypeFrom(context.userAgent);
      const result = await this.prisma.analyticsEvent.createMany({
        data: events.map((event) => ({
          ...event,
          props: event.props ?? undefined,
          deviceType,
          userId: context.userId,
        })),
      });
      return result.count;
    } catch (error) {
      // Logged, never rethrown. One line per failed batch, not per event.
      activity(
        this.logger,
        'analytics.ingest_failed',
        { error: error instanceof Error ? error.message : String(error) },
        'warn',
      );
      return 0;
    }
  }
}
