import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../config/config.module';
import { activity } from '../../shared/logging/activity';
import { ipMatchesAllowlist, parseIpAllowlist } from '../net/ip-allowlist';

/**
 * Restricts the payment webhook to the provider's own egress addresses.
 *
 * **This is not what authenticates the webhook.** The HMAC over the raw body
 * is, and it stands alone: an attacker calling from a permitted address still
 * cannot produce a valid signature. This guard exists only so that forged
 * deliveries are refused before they reach the verification code at all.
 *
 * Off unless `RAZORPAY_WEBHOOK_IPS` is set, because a stale list is a revenue
 * incident: a legitimate notification from an address Razorpay added later is
 * refused, and a buyer who closed the tab after paying is not settled by the
 * webhook. Two things keep that recoverable:
 *
 * - A refusal is a 403, so Razorpay keeps retrying for roughly a day — long
 *   enough to correct the env var on the running service and have the genuine
 *   deliveries arrive by themselves.
 * - Reconciliation settles captured payments the webhook never delivered, so
 *   even an exhausted retry schedule does not end with money taken and nothing
 *   given.
 *
 * The address compared is `req.ip`, which is only the true client when
 * `trust proxy` is configured — it is, in main.ts. `GET /api/health/client-ip`
 * is how to confirm that against a real deployment before switching this on.
 */
@Injectable()
export class WebhookIpGuard implements CanActivate {
  private readonly logger = new Logger(WebhookIpGuard.name);
  private readonly ranges: ReturnType<typeof parseIpAllowlist>['ranges'];

  constructor(config: AppConfig) {
    const configured = config.get('RAZORPAY_WEBHOOK_IPS');
    const { ranges, invalid } = parseIpAllowlist(configured);
    this.ranges = ranges;

    if (invalid.length > 0) {
      // Loud, because a typo silently narrows the allowlist, and a narrowed
      // allowlist looks exactly like an attack in the logs.
      this.logger.error(
        `RAZORPAY_WEBHOOK_IPS has ${invalid.length} unparseable entr(ies), ignored: ${invalid.join(', ')}`,
      );
    }

    this.logger.log(
      ranges.length > 0
        ? `Razorpay webhook restricted to ${ranges.length} allowed range(s)`
        : 'Razorpay webhook accepts delivery from any address (signature-only)',
    );
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.ranges.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (ipMatchesAllowlist(request.ip, this.ranges)) return true;

    activity(this.logger, 'webhook.ip_rejected', { ip: request.ip }, 'warn');

    throw new ForbiddenException('Webhook delivery is not permitted from this address');
  }
}
