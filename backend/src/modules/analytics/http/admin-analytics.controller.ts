import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AnalyticsReportService } from '../application/analytics-report.service';
import { FinanceReportService } from '../application/finance-report.service';
import { AnalyticsSummaryQueryDto, FinanceSummaryQueryDto } from './dto/analytics.dto';

/** The admin Analytics page. ADMIN only; aggregates only, never one visitor's trail. */
@ApiTags('admin: analytics')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(
    private readonly reports: AnalyticsReportService,
    private readonly finance: FinanceReportService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Visitors, page views, funnel, top pages/referrers/UTM sources and devices for a date range (max 180 days)',
  })
  summary(@Query() query: AnalyticsSummaryQueryDto) {
    return this.reports.summary(query);
  }

  @Get('finance')
  @ApiOperation({
    summary:
      'Money in and out across every app — sales, refunds, net, by stream, channel, product and coupon — for a date range or all time',
  })
  financeSummary(@Query() query: FinanceSummaryQueryDto) {
    return this.finance.summary(query);
  }
}
