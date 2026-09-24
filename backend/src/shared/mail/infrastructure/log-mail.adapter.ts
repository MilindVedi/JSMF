import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MailProvider,
  type MailProviderName,
  type SendMailRequest,
  type SendMailResult,
} from '../domain/mail-provider.port';

/**
 * The development adapter: prints the message instead of sending it.
 *
 * Like the local storage driver and the payment stub, this is not a mock that
 * pretends to succeed — it is a real delivery channel whose destination happens
 * to be the log. The entire admin-registration flow, OTP included, therefore
 * works end to end before any SMTP account exists, and the code is visible
 * where a developer is already looking.
 *
 * Env validation refuses to boot in production with this selected, so an OTP
 * can never be "delivered" to a log file in front of real users.
 */
@Injectable()
export class LogMailAdapter extends MailProvider {
  readonly name: MailProviderName = 'log';

  private readonly logger = new Logger(LogMailAdapter.name);

  async send(request: SendMailRequest): Promise<SendMailResult> {
    const recipients = (Array.isArray(request.to) ? request.to : [request.to])
      .map((address) => address.email)
      .join(', ');

    this.logger.log(
      [
        '',
        '──────────────── EMAIL (not actually sent) ────────────────',
        `To:      ${recipients}`,
        `Subject: ${request.subject}`,
        request.tag ? `Tag:     ${request.tag}` : null,
        '',
        request.text,
        '───────────────────────────────────────────────────────────',
      ]
        .filter((line) => line !== null)
        .join('\n'),
    );

    return { messageId: `log_${randomUUID()}`, provider: this.name };
  }
}
