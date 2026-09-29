import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import {
  WhatsAppBillingError,
  WhatsAppProvider,
  type SendWhatsAppRequest,
} from '../domain/whatsapp-provider.port';

/** Same two-way outcome as mail and SMS, so channels above translate one vocabulary. */
export type WhatsAppOutcome =
  | { delivered: true; messageId: string }
  | { delivered: false; reason: 'quota' | 'error' };

/**
 * Sending a WhatsApp message and reporting — never throwing — the outcome.
 *
 * No delivery table, for the reason `SmsService` gives: Meta's own dashboard
 * already reports sends, spend and quality, and duplicating it costs a
 * migration for no decision it would change.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly provider: WhatsAppProvider,
    private readonly config: AppConfig,
  ) {}

  /** Whether a transport exists at all. Whether it is *offered* is decided in identity. */
  enabled(): boolean {
    return this.config.get('WHATSAPP_DRIVER') !== 'none';
  }

  async send(request: SendWhatsAppRequest): Promise<WhatsAppOutcome> {
    try {
      const result = await this.provider.send(request);
      return { delivered: true, messageId: result.messageId };
    } catch (cause) {
      const billing = cause instanceof WhatsAppBillingError;
      const detail = cause instanceof Error ? cause.message : String(cause);

      this.logger.error(
        billing
          ? `WHATSAPP BILLING FAILURE — no messages will send until billing is fixed. ${detail}`
          : `WhatsApp delivery failed${request.tag ? ` (${request.tag})` : ''}: ${detail}`,
      );

      return { delivered: false, reason: billing ? 'quota' : 'error' };
    }
  }
}
