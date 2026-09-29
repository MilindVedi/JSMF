import { Injectable, Logger } from '@nestjs/common';
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
import { mailboxDomain, parseMailbox } from '../domain/mailbox';

const MSG91_EMAIL_API = 'https://control.msg91.com/api/v5/email/send';

/**
 * MSG91's Email API, over HTTP directly — no SDK, for the reason the Resend and
 * MSG91 SMS adapters give: one endpoint, called with `fetch`.
 *
 * ## One pass-through template, not a template per email
 *
 * MSG91 only sends templates stored in its dashboard; there is no "here is the
 * HTML" field. Mirroring every JSMF email as an MSG91 template would put the
 * wording in two places that drift apart, and make switching `MAIL_DRIVER`
 * back to Resend change what people receive.
 *
 * So the wording stays in `templates/mail-templates.ts`, exactly as for every
 * other driver, and MSG91 holds a single template that is nothing but blanks:
 *
 * ```
 * Subject: {{subject}}
 * Body:    {{body}}
 * ```
 *
 * `MSG91_EMAIL_TEMPLATE_ID` names it. The rendered HTML (or the plain-text part
 * when a message has no HTML) is passed as `body`, so every email looks the
 * same whichever provider carried it.
 *
 * The sending domain must be verified under MSG91 → Email → Domains. It is
 * taken from `MAIL_FROM` unless `MSG91_EMAIL_DOMAIN` says otherwise — the same
 * way Resend requires `MAIL_FROM` to be on a verified domain.
 */
@Injectable()
export class Msg91MailAdapter extends MailProvider {
  readonly name: MailProviderName = 'msg91';

  private readonly logger = new Logger(Msg91MailAdapter.name);

  private readonly authKey: string;
  private readonly templateId: string;
  private readonly from: MailAddress;
  private readonly domain: string;

  constructor(config: AppConfig) {
    super();

    // Non-null: env validation refuses to boot with MAIL_DRIVER=msg91 and
    // either of these missing.
    this.authKey = config.get('MSG91_AUTH_KEY')!;
    this.templateId = config.get('MSG91_EMAIL_TEMPLATE_ID')!;
    this.from = parseMailbox(config.get('MAIL_FROM'));
    this.domain = config.get('MSG91_EMAIL_DOMAIN') || mailboxDomain(this.from);

    this.logger.log(`MSG91 email configured (domain=${this.domain}, template=${this.templateId})`);
  }

  async send(request: SendMailRequest): Promise<SendMailResult> {
    let response: Response;

    try {
      response = await fetch(MSG91_EMAIL_API, {
        method: 'POST',
        headers: {
          authkey: this.authKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(this.payload(request)),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new MailDeliveryError(`Could not reach MSG91: ${message}`, this.name);
    }

    const body = (await response.json().catch(() => null)) as Msg91EmailResponse | null;

    if (!response.ok || body?.hasError || body?.status === 'fail') {
      throw classify(describeError(body, response.status), this.name);
    }

    return { messageId: body?.data?.unique_id ?? 'unknown', provider: this.name };
  }

  /** The request body, built in one place so the spec can assert it field by field. */
  private payload(request: SendMailRequest) {
    const to = (Array.isArray(request.to) ? request.to : [request.to]).map(toRecipient);

    // MSG91's template naturally prepends "JSMF - ", so we strip it if present
    // so it does not appear twice.
    let finalSubject = request.subject;
    if (finalSubject.startsWith('JSMF - ')) {
      finalSubject = finalSubject.substring(7);
    }

    return {
      recipients: [
        {
          to,
          variables: {
            subject: finalSubject,
            body: request.html ?? textAsHtml(request.text),
          },
        },
      ],
      from: toRecipient(this.from),
      domain: this.domain,
      template_id: this.templateId,
      reply_to: request.replyTo ? [toRecipient(request.replyTo)] : undefined,
    };
  }
}

interface Msg91EmailResponse {
  status?: 'success' | 'fail';
  hasError?: boolean;
  data?: { unique_id?: string };
  message?: string;
  errors?: Record<string, string[] | string>;
}

function toRecipient(address: MailAddress) {
  return address.name ? { name: address.name, email: address.email } : { email: address.email };
}

/** MSG91 reports errors as a map of field → messages; flatten it for the log. */
export function describeError(body: Msg91EmailResponse | null, status: number): string {
  const fromErrors = body?.errors
    ? Object.entries(body.errors)
        .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join('; ')
    : '';
  return fromErrors || body?.message || `HTTP ${status}`;
}

/**
 * MSG91 is prepaid: an empty wallet is the email equivalent of Resend's quota,
 * the one failure where the answer is "top up", not "try again". It is only
 * signalled in wording, hence the text match — the same trade-off the SMS
 * adapter makes.
 */
export function classify(message: string, provider: MailProviderName): Error {
  if (/balance|insufficient|credit|recharge|quota|limit exceeded/i.test(message)) {
    return new MailQuotaExceededError(`MSG91 email: ${message}`, provider);
  }
  return new MailDeliveryError(`MSG91 refused the email: ${message}`, provider);
}

/** For a message with no HTML part: escaped, with line breaks kept. */
export function textAsHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped.replace(/\r?\n/g, '<br>');
}
