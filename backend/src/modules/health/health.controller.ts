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
   * `TRUST_PROXY_HOPS` cannot be verified by reasoning about it — how many
   * entries `X-Forwarded-For` carries is a property of the deployment, and
   * both wrong answers fail silently. Too low and every user shares one bucket
   * (per-IP limits become site-wide ones); too high and a caller can forge the
   * header to mint a fresh identity and bypass throttling. So: open this from
   * two different networks, such as a phone on mobile data and a laptop on
   * wi-fi, and check that `clientIp` differs. If it is the same for both, the
   * hop count is too low.
   *
   * Public and safe to leave in place: it tells a caller only their own address,
   * which they already know, and the header they themselves sent.
   */
  @Get('client-ip')
  @ApiOperation({ summary: 'Diagnostic — the client address rate limiting is keyed on' })
  clientIp(@Req() request: Request): {
    clientIp: string | undefined;
    forwardedFor: string | null;
    trustProxyHops: number;
  } {
    const forwarded = request.headers['x-forwarded-for'];

    return {
      // Exactly what @nestjs/throttler keys its counters on.
      clientIp: request.ip,
      forwardedFor: Array.isArray(forwarded) ? forwarded.join(', ') : (forwarded ?? null),
      trustProxyHops: this.config.get('TRUST_PROXY_HOPS'),
    };
  }
}
