import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import { WhatsAppService } from '../../../shared/whatsapp/application/whatsapp.service';
import {
  VerificationChannel,
  VerificationDeliveryError,
  type VerificationAddressKind,
  type VerificationChannelName,
  type VerificationDelivery,
} from '../domain/verification-channel.port';

/**
 * One-time codes over WhatsApp — the preferred phone channel.
 *
 * Preferred over SMS because it needs no DLT registration, arrives with a
 * copy-code button, and costs about the same. SMS remains the fallback for a
 * number that has no WhatsApp.
 *
 * Nothing here names Meta; the template and its quirks live in the adapter.
 */
@Injectable()
export class WhatsAppVerificationChannel extends VerificationChannel {
  readonly name: VerificationChannelName = 'whatsapp';
  readonly addressKind: VerificationAddressKind = 'phone';

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  /** Transport configured *and* the mobile flow switched on — see `SmsVerificationChannel`. */
  isConfigured(): boolean {
    return this.whatsapp.enabled() && this.config.get('PHONE_SIGNIN_ENABLED');
  }

  async deliver(delivery: VerificationDelivery): Promise<void> {
    const outcome = await this.whatsapp.send({
      to: delivery.destination,
      // Expiry is not sent: an authentication template's expiry is fixed on the
      // template itself, which must be set to match the backend's TTL.
      message: { kind: 'authentication-code', code: delivery.code },
      tag: `${delivery.intent}-code`,
    });

    if (!outcome.delivered) {
      throw new VerificationDeliveryError(
        outcome.reason === 'quota' ? 'WhatsApp billing unavailable' : 'WhatsApp delivery failed',
        outcome.reason,
        this.name,
      );
    }
  }
}
