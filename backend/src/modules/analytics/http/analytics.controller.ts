import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipLegalCheck } from '../../../common/decorators/skip-legal-check.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { AnalyticsIngestService } from '../application/analytics-ingest.service';

/**
 * Read at request time, like MAX_UPLOAD_SIZE_MB: a decorator is evaluated
 * before configuration is injectable. Validated in config/env.ts all the same.
 */
const rateLimit = () => Number(process.env.ANALYTICS_RATE_LIMIT_PER_MINUTE) || 120;

/**
 * Where the websites send their activity events, in batches.
 *
 * Always 204, whatever arrived and whether or not it was stored — including
 * when ANALYTICS_ENABLED is off. Nothing on a page waits for or reads this
 * response, and nothing about it may ever become a visible error. The only
 * other answer a caller can see is the throttler's 429, which the tracker
 * ignores the same way.
 */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly ingest: AnalyticsIngestService) {}

  @Public()
  // Recording a page view is not "using the service": a signed-in visitor who
  // has not accepted the newest Terms must not get a 403 for it.
  @SkipLegalCheck()
  @Throttle({ default: { limit: rateLimit, ttl: 60_000 } })
  @Post('events')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Record a batch of website events (max 20). Accepts JSON or text/plain JSON; always 204',
  })
  async record(@Body() body: unknown, @Req() request: Request & { user?: AuthenticatedUser }): Promise<void> {
    await this.ingest.ingest(body, {
      // Attached by JwtAuthGuard only when a valid token came with the request;
      // anonymous otherwise, and never refused for lacking one.
      userId: request.user?.id ?? null,
      userAgent: request.get('user-agent'),
    });
  }
}
