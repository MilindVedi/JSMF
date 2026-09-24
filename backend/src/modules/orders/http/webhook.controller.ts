import { Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { PaymentService } from '../application/payment.service';

/**
 * Where the provider tells us money actually moved.
 *
 * `@Public` because Razorpay has no JSMF account and sends no bearer token —
 * the HMAC over the raw body is the authentication, and it is stronger than a
 * session would be. `@SkipThrottle` because throttling this endpoint would
 * throttle our own revenue: a burst of genuine captures must never be dropped,
 * and the signature check already makes unauthenticated flooding pointless.
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly payments: PaymentService) {}

  @Post('razorpay')
  @Public()
  @SkipThrottle()
  // 200 on a duplicate as well as on a fresh event: providers retry until they
  // get a success, so answering anything else for an event we have already
  // handled just invites the same delivery again.
  @HttpCode(200)
  async razorpay(@Req() request: Request & { rawBody?: Buffer }) {
    // The exact bytes received. A re-serialised parse would not reproduce the
    // provider's HMAC, so `rawBody: true` in main.ts is load-bearing here.
    const rawBody = request.rawBody;

    if (!rawBody?.length) {
      this.logger.warn('Webhook received with no raw body');
      return { received: true, processed: false };
    }

    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? value[0] : (value ?? ''),
      ]),
    ) as Record<string, string>;

    const result = await this.payments.handleWebhook(rawBody, headers);

    return { received: true, ...result };
  }
}
