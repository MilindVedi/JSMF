import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import { SmsService } from '../../../shared/sms/application/sms.service';
import {
  VerificationChannel,
  VerificationDeliveryError,
  type VerificationAddressKind,
  type VerificationChannelName,
  type VerificationDelivery,
} from '../domain/verification-channel.port';

/**
 * One-time codes over SMS.
 *
 * The second implementation of `VerificationChannel`, and the one the port was
 * written for. Note what is *not* here: no signup logic, no code generation, no
 * decision about when SMS is used. The same code that would have gone by email
 * goes by text, and every flow above remains unaware which happened.
 *
 * Nothing in here names MSG91 — that is `SmsModule`'s business. Swapping the
 * vendor is a change to one environment variable and does not touch identity.
 */
@Injectable()
export class SmsVerificationChannel extends VerificationChannel {
  readonly name: VerificationChannelName = 'sms';
  readonly addressKind: VerificationAddressKind = 'phone';

  constructor(
    private readonly sms: SmsService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  /**
   * Unlike email, genuinely conditional.
   *
   * Email answers `true` unconditionally because a deployment with no mail at
   * all is a misconfiguration. SMS is optional by design — it costs money per
   * message and requires a regulator-approved template — so this reports the
   * truth, and that truth is what stops the storefront offering "continue with
   * your mobile number" on a deployment where no message could be sent.
   *
   * Also requires `PHONE_SIGNIN_ENABLED`: a phone channel is only reachable
   * through the mobile sign-in flow, so offering it while that flow is
   * switched off would point people at a screen that does not exist.
   */
  isConfigured(): boolean {
    return this.sms.enabled() && this.config.get('PHONE_SIGNIN_ENABLED');
  }

  async deliver(delivery: VerificationDelivery): Promise<void> {
    const outcome = await this.sms.send({
      to: delivery.destination,
      // The names the DLT-registered template expects. Both channels carry the
      // same two facts — the code and how long it lasts — because they are
      // answering the same question; only the rendering differs, and for SMS
      // the rendering belongs to the regulator rather than to us.
      variables: {
        OTP: delivery.code,
        EXPIRY: String(delivery.expiresInMinutes),
      },
      tag: `${delivery.intent}-code`,
    });

    if (!outcome.delivered) {
      // The provider's own wording stays in the log; what travels upward is the
      // classification, which is all the caller needs and all a user should be
      // told. `quota` here means an empty prepaid balance — same handling as an
      // email allowance, but it will not fix itself overnight.
      throw new VerificationDeliveryError(
        outcome.reason === 'quota' ? 'SMS balance exhausted' : 'SMS delivery failed',
        outcome.reason,
        this.name,
      );
    }
  }
}
