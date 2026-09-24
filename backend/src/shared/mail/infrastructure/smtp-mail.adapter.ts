import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../../../config/config.module';
import {
  MailProvider,
  type MailAddress,
  type MailProviderName,
  type SendMailRequest,
  type SendMailResult,
} from '../domain/mail-provider.port';

/**
 * SMTP delivery.
 *
 * SMTP rather than one vendor's HTTP API because it is the one protocol every
 * provider speaks: Gmail, Resend, Brevo, SES, Mailgun and Postmark are all a
 * credentials change away, with no second adapter to write. The cost is that a
 * few hosting platforms block outbound SMTP ports — if that turns up in
 * production, an HTTP adapter is a new class behind this same port and nothing
 * that sends mail changes.
 */
@Injectable()
export class SmtpMailAdapter extends MailProvider {
  readonly name: MailProviderName = 'smtp';

  private readonly logger = new Logger(SmtpMailAdapter.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfig) {
    super();

    const port = config.get('SMTP_PORT');

    this.transporter = createTransport({
      host: config.get('SMTP_HOST'),
      port,
      // Implicit TLS on 465; STARTTLS (upgraded after connecting) on 587 and
      // 25. Getting this backwards is the single most common SMTP
      // misconfiguration, so it is derived from the port rather than asked for.
      secure: port === 465,
      auth: {
        user: config.get('SMTP_USER'),
        pass: config.get('SMTP_PASSWORD'),
      },
    });

    this.from = config.get('MAIL_FROM');
  }

  async send(request: SendMailRequest): Promise<SendMailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: formatAddresses(request.to),
        replyTo: request.replyTo ? formatAddress(request.replyTo) : undefined,
        subject: request.subject,
        text: request.text,
        html: request.html,
      });

      return { messageId: info.messageId, provider: this.name };
    } catch (error) {
      // SMTP failures are operational, not caller errors: a wrong password or
      // an unreachable host is a 503, not a 400. The provider's own message is
      // preserved because "535 Authentication failed" is the entire diagnosis.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`SMTP delivery failed: ${message}`);

      throw new ServiceUnavailableException(
        `Could not send email: ${message}. Check SMTP_HOST, SMTP_USER and SMTP_PASSWORD.`,
      );
    }
  }
}

function formatAddresses(to: MailAddress | MailAddress[]): string {
  return (Array.isArray(to) ? to : [to]).map(formatAddress).join(', ');
}

function formatAddress(address: MailAddress): string {
  return address.name ? `"${address.name}" <${address.email}>` : address.email;
}
