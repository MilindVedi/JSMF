import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AnalyticsIngestService } from './application/analytics-ingest.service';
import { AnalyticsReportService } from './application/analytics-report.service';
import { FinanceReportService } from './application/finance-report.service';
import { AdminAnalyticsController } from './http/admin-analytics.controller';
import { AnalyticsController } from './http/analytics.controller';
import { plainTextBody } from './http/plain-text-body.middleware';

/**
 * First-party activity analytics for the websites: a batch ingest endpoint and
 * the admin summary. See docs/analytics/README.md.
 */
@Module({
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsIngestService, AnalyticsReportService, FinanceReportService],
})
export class AnalyticsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(plainTextBody).forRoutes({ path: 'analytics/events', method: RequestMethod.POST });
  }
}
