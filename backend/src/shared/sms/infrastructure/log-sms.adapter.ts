import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  SmsProvider,
  type SendSmsRequest,
  type SendSmsResult,
  type SmsProviderName,
} from '../domain/sms-provider.port';

/**
 * Prints the message instead of sending it.
 *
 * The counterpart of `MAIL_DRIVER=log`, and it exists for the same reason: the
 * mobile flow has to be exercisable end to end before an MSG91 account, a DLT
 * registration and an approved template all exist — which in India is a
 * multi-day process involving a regulator, not a signup form.
 *
 * Refused in production by env validation, because a one-time code written to
 * a log file is both a broken flow and a live credential sitting in plaintext.
 */
@Injectable()
export class LogSmsAdapter extends SmsProvider {
  readonly name: SmsProviderName = 'log';

  private readonly logger = new Logger('SMS');

  async send(request: SendSmsRequest): Promise<SendSmsResult> {
    const variables = Object.entries(request.variables)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');

    this.logger.log(
      `\n──────── SMS (not sent) ────────\n` +
        `to:   +${request.to}\n` +
        `tag:  ${request.tag ?? '—'}\n` +
        `vars: ${variables}\n` +
        `────────────────────────────────`,
    );

    return { messageId: `log-${randomUUID()}`, provider: this.name };
  }
}
