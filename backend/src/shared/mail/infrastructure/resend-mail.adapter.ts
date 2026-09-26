import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import {
  MailDeliveryError,
  MailProvider,
  MailQuotaExceededError,
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
      throw new MailDeliveryError(`Could not reach Resend: ${message}`, this.name);
    }

    const text = await response.text();

    if (!response.ok) {
      const error = parseError(text);
      const detail = error.message ?? `status ${response.status}`;

      // Both arrive as 429, and conflating them would make the delivery log
      // useless for the one question it exists to answer. The per-second limit
      // is transient — it clears in a second and says nothing about the plan.
      // The daily/monthly quota is the one that means "upgrade".
      if (isQuota(response.status, error)) {
        throw new MailQuotaExceededError(detail, this.name);
      }

      throw new MailDeliveryError(detail, this.name);
    }

    return { messageId: (JSON.parse(text) as ResendSuccess).id, provider: this.name };
  }
}

function parseError(body: string): ResendError {
  try {
    return JSON.parse(body) as ResendError;
  } catch {
    return {};
  }
}

/**
 * Resend names the daily allowance separately from the request rate limit
 * (`daily_quota_exceeded` versus `rate_limit_exceeded`), so the name is the
 * reliable signal; the message is checked too in case the naming changes.
 */
function isQuota(status: number, error: ResendError): boolean {
  if (status !== 429) return false;

  const haystack = `${error.name ?? ''} ${error.message ?? ''}`.toLowerCase();
  return haystack.includes('quota') || haystack.includes('daily');
}

/** Resend takes recipients as an array, but accepts `"Name" <addr>` in each. */
function formatAddresses(to: MailAddress | MailAddress[]): string[] {
  return (Array.isArray(to) ? to : [to]).map(formatAddress);
}

function formatAddress(address: MailAddress): string {
  return address.name ? `"${address.name}" <${address.email}>` : address.email;
}
