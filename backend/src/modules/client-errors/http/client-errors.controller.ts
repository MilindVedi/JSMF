import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipLegalCheck } from '../../../common/decorators/skip-legal-check.decorator';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { ClientErrorIntakeService } from '../application/client-error-intake.service';

/**
 * Read at request time, like ANALYTICS_RATE_LIMIT_PER_MINUTE: a decorator is
 * evaluated before configuration is injectable. Validated in config/env.ts.
 */
const rateLimit = () => Number(process.env.CLIENT_ERRORS_RATE_LIMIT_PER_MINUTE) || 30;

/**
 * Where the websites and the phone app report crashes.
 *
 * Public, because a crash can happen before or without sign-in, and the most
 * important ones (the sign-in page itself breaking) happen exactly then. What
 * keeps a public write endpoint safe: it writes only to the log, never to the
 * database; the body is size-capped, validated and redacted (see
 * domain/client-error.ts); each caller is throttled; and a per-instance budget
 * caps what all callers together can make it write.
 *
 * Always 204, like the analytics intake — nothing may depend on this answer.
 */
@ApiTags('client-errors')
@Controller('client-errors')
export class ClientErrorsController {
  constructor(private readonly intake: ClientErrorIntakeService) {}

  @Public()
  // Reporting a crash is not "using the service": a user with pending terms
  // must not get a 403 for it.
  @SkipLegalCheck()
  @Throttle({ default: { limit: rateLimit, ttl: 60_000 } })
  @Post()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Report client-side errors (max 5). Accepts JSON or text/plain JSON; always 204',
  })
  record(@Body() body: unknown, @Req() request: Request & { user?: AuthenticatedUser }): void {
    this.intake.record(body, {
      userId: request.user?.id ?? null,
      userAgent: request.get('user-agent'),
    });
  }
}
