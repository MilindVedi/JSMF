import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfig } from '../../config/config.module';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  async check(): Promise<{ status: string; database: string; timestamp: string }> {
    // Actually touches the database rather than reporting "ok" for a process
    // that is running but cannot serve a single real request.
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * What the rate limiter thinks you are.
   *
   * Client IPs are resolved by walking `X-Forwarded-For` from the right and
   * skipping addresses in `TRUST_PROXY_RANGES`, stopping at the first one a
   * trusted proxy did not write. Whether that list is complete is a property of
   * the deployment, not something to reason out: an unlisted proxy is taken for
   * the client, and then every visitor shares a single rate-limit bucket while
   * nothing appears to be wrong.
   *
   * So: open this from two different networks, such as a phone on mobile data
   * and a laptop on wi-fi, and check that `clientIp` differs and is your own
   * address rather than a proxy. `forwardedFor` shows the whole chain, so a
   * newly added proxy is visible as an extra entry.
   *
   * Public and safe to leave in place: it tells a caller only their own address,
   * which they already know, and the header they themselves sent.
   */
  @Get('client-ip')
  @ApiOperation({ summary: 'Diagnostic — the client address rate limiting is keyed on' })
  clientIp(@Req() request: Request): {
    clientIp: string | undefined;
    forwardedFor: string | null;
    trustedRanges: string[];
  } {
    const forwarded = request.headers['x-forwarded-for'];

    return {
      // Exactly what @nestjs/throttler keys its counters on.
      clientIp: request.ip,
      forwardedFor: Array.isArray(forwarded) ? forwarded.join(', ') : (forwarded ?? null),
      trustedRanges: this.config.get('TRUST_PROXY_RANGES'),
    };
  }
}
