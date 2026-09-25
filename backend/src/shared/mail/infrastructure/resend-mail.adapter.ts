import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import {
  MailProvider,
  type MailAddress,
  type MailProviderName,
  type SendMailRequest,
  type SendMailResult,
} from '../domain/mail-provider.port';

const RESEND_API = 'https://api.resend.com';

interface ResendSuccess {
  id: string;
}

interface ResendError {
  statusCode?: number;
  message?: string;
  name?: string;
}

/**
 * Resend over its REST API directly.
 *
 * No SDK, for the reason the Razorpay adapter gives: the surface actually used
 * is a single endpoint, and a package that wraps one `fetch` call is a
 * dependency whose release cadence becomes ours.
 *
 * Chosen over SMTP for production because deliverability is the whole point of
 * a transactional mail account — Resend signs with DKIM and reports bounces per
 * message, where an SMTP relay hands back "250 OK" and nothing afterwards — and
 * because an HTTPS call is unaffected by the outbound-SMTP-port blocking common
 * on serverless hosts, Cloud Run included.
 */
@Injectable()
export class ResendMailAdapter extends MailProvider {
  readonly name: MailProviderName = 'resend';

  private readonly logger = new Logger(ResendMailAdapter.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor(config: AppConfig) {
    super();

    // Non-null: env validation refuses to boot with MAIL_DRIVER=resend and no
    // key, so reaching here without one is impossible.
    this.apiKey = config.get('RESEND_API_KEY')!;
    this.from = config.get('MAIL_FROM');
  }

  async send(request: SendMailRequest): Promise<SendMailResult> {
    let response: Response;

    try {
      response = await fetch(`${RESEND_API}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: formatAddresses(request.to),
          reply_to: request.replyTo ? formatAddress(request.replyTo) : undefined,
          subject: request.subject,
          text: request.text,
          html: request.html,
          // Resend rejects the whole send if a tag contains anything outside
          // ASCII letters, digits, underscores and dashes — hence the port
          // asking callers for a slug like `admin-registration-code` rather
          // than free text.
          tags: request.tag ? [{ name: 'tag', value: request.tag }] : undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.logger.error(`Could not reach Resend: ${message}`);

      throw new ServiceUnavailableException(`Could not send email: ${message}`);
    }

    const text = await response.text();

    if (!response.ok) {
      // Resend's own message is the diagnosis — "The jsmf.local domain is not
      // verified" is the entire fix — so it is surfaced, as the SMTP adapter
      // surfaces "535 Authentication failed". The rest of the body is not: it
      // echoes the recipient, and mail failures get logged.
      const detail = parseError(text) ?? `status ${response.status}`;
      this.logger.error(`Resend rejected the send → ${response.status}: ${detail}`);

      throw new ServiceUnavailableException(
        `Could not send email: ${detail}. Check RESEND_API_KEY and that MAIL_FROM uses a domain verified in Resend.`,
      );
    }

    return { messageId: (JSON.parse(text) as ResendSuccess).id, provider: this.name };
  }
}

function parseError(body: string): string | null {
  try {
    return (JSON.parse(body) as ResendError).message ?? null;
  } catch {
    return null;
  }
}

/** Resend takes recipients as an array, but accepts `"Name" <addr>` in each. */
function formatAddresses(to: MailAddress | MailAddress[]): string[] {
  return (Array.isArray(to) ? to : [to]).map(formatAddress);
}

function formatAddress(address: MailAddress): string {
  return address.name ? `"${address.name}" <${address.email}>` : address.email;
}
