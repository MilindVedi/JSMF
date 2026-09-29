import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  WhatsAppProvider,
  type SendWhatsAppRequest,
  type SendWhatsAppResult,
  type WhatsAppProviderName,
} from '../domain/whatsapp-provider.port';

/**
 * Prints the message instead of sending it, so the mobile flow can be driven
 * end to end before a Meta Business account and an approved template exist.
 *
 * Refused in production by env validation: a one-time code in a log file is a
 * live credential in plaintext.
 */
@Injectable()
export class LogWhatsAppAdapter extends WhatsAppProvider {
  readonly name: WhatsAppProviderName = 'log';

  private readonly logger = new Logger('WhatsApp');

  async send(request: SendWhatsAppRequest): Promise<SendWhatsAppResult> {
    // Every field the message carries, whatever its kind. Printing `code` by
    // name would have silently stopped showing anything useful the moment a
    // second kind of message was added.
    const { kind, ...fields } = request.message;
    const detail = Object.entries(fields)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n');

    this.logger.log(
      `\n──────── WhatsApp (not sent) ────────\n` +
        `to: +${request.to}\n` +
        `tag: ${request.tag ?? '—'}\n` +
        `kind: ${kind}\n` +
        `${detail}\n` +
        `─────────────────────────────────────`,
    );

    return { messageId: `log-${randomUUID()}`, provider: this.name };
  }
}
