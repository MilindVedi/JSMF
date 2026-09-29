import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import {
  SmsBalanceExhaustedError,
  SmsProvider,
  type SendSmsRequest,
} from '../domain/sms-provider.port';

/**
 * Delivered, or why not — in the only two shapes a caller can act on
 * differently. Mirrors `MailService`'s outcome deliberately: the channel above
 * translates both into the same `VerificationDeliveryError`, and two transports
 * reporting failure in two different vocabularies would put a translation table
 * in the middle for no reason.
 */
export type SmsOutcome =
  | { delivered: true; messageId: string }
  | { delivered: false; reason: 'quota' | 'error' };

/**
 * Sending a text message, with the decision every caller of the raw port
 * otherwise has to reinvent: whether a failure should be an exception.
 *
 * Here it never is. Every current caller — and, realistically, every future one
 * — is delivering something that accompanies an action rather than being it, so
 * the outcome is returned and the caller decides. That is the same reasoning as
 * `MailService.sendBestEffort`, minus the half that does throw, because no SMS
 * we send is the feature itself.
 *
 * **No delivery table, unlike email.** `email_deliveries` exists because no
 * provider reports remaining allowance and the free tier is small enough to
 * outgrow by accident. SMS is prepaid with a balance visible in MSG91's own
 * dashboard, so a table here would duplicate a number somebody else already
 * maintains — at the cost of a migration. If per-message auditing is ever
 * needed (a dispute about whether a code was sent), that is the point to add
 * one, and the shape would follow `email_deliveries` exactly.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly provider: SmsProvider,
    private readonly config: AppConfig,
  ) {}

  /**
   * Whether SMS can be used at all.
   *
   * This is what decides whether "use your mobile number instead" is offered to
   * a buyer whose email failed. Offering a route that is not wired up is worse
   * than offering none — it turns a recoverable problem into a dead end the
   * person has already been told will work.
   */
  enabled(): boolean {
    return this.config.get('SMS_DRIVER') !== 'none';
  }

  async send(request: SendSmsRequest): Promise<SmsOutcome> {
    try {
      const result = await this.provider.send(request);
      return { delivered: true, messageId: result.messageId };
    } catch (cause) {
      const exhausted = cause instanceof SmsBalanceExhaustedError;
      const detail = cause instanceof Error ? cause.message : String(cause);

      if (exhausted) {
        // Loud, and distinct from an ordinary failure: this one is not a bug to
        // chase but an account to top up, and every message after it fails the
        // same way until somebody does. Unlike the mail quota there is no
        // window that resets on its own.
        this.logger.error(
          `SMS BALANCE EXHAUSTED — no further messages will be delivered until the ` +
            `MSG91 account is topped up. ${detail}`,
        );
      } else {
        this.logger.error(`SMS delivery failed${request.tag ? ` (${request.tag})` : ''}: ${detail}`);
      }

      return { delivered: false, reason: exhausted ? 'quota' : 'error' };
    }
  }
}
