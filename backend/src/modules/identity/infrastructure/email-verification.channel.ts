import { Injectable } from '@nestjs/common';
import { MailService } from '../../../shared/mail/application/mail.service';
import { passwordResetCode, signupVerificationCode } from '../../../shared/mail/templates/mail-templates';
import {
  VerificationChannel,
  VerificationDeliveryError,
  type VerificationAddressKind,
  type VerificationChannelName,
  type VerificationDelivery,
} from '../domain/verification-channel.port';

/**
 * One-time codes over email.
 *
 * Uses `sendBestEffort` rather than `send` even though a failure here *does*
 * fail the flow. That looks backwards and is deliberate: `send` throws a
 * deliberately vague `ServiceUnavailableException`, which is right for a caller
 * that will surface it directly, and wrong here — this channel has to know
 * *why* it failed so the layer above can decide between offering another
 * channel and telling the buyer to retry later. `sendBestEffort` reports the
 * reason instead of discarding it, and the decision to fail the flow is made
 * above, where the alternatives are known.
 */
@Injectable()
export class EmailVerificationChannel extends VerificationChannel {
  readonly name: VerificationChannelName = 'email';
  readonly addressKind: VerificationAddressKind = 'email';

  constructor(private readonly mail: MailService) {
    super();
  }

  /**
   * Always true. Email is the channel the platform is built around — a
   * deployment with no mail driver at all is a misconfiguration that env
   * validation already refuses in production, not a state this should quietly
   * report as "unavailable".
   */
  isConfigured(): boolean {
    return true;
  }

  async deliver(delivery: VerificationDelivery): Promise<void> {
    const rendered =
      delivery.intent === 'signup'
        ? signupVerificationCode({
            name: delivery.name ?? null,
            code: delivery.code,
            expiresInMinutes: delivery.expiresInMinutes,
          })
        : passwordResetCode({
            code: delivery.code,
            expiresInMinutes: delivery.expiresInMinutes,
          });

    const outcome = await this.mail.sendBestEffort({
      to: { email: delivery.destination, name: delivery.name },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag: delivery.intent === 'signup' ? 'signup-verification' : 'password-reset',
    });

    if (!outcome.delivered) {
      // The provider's own wording stays in the log and the delivery record;
      // what travels upward is the classification, which is all the caller
      // needs and all a user should ever be told.
      throw new VerificationDeliveryError(
        outcome.reason === 'quota'
          ? 'Email allowance exhausted'
          : 'Email delivery failed',
        outcome.reason,
        this.name,
      );
    }
  }
}
