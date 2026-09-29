import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import {
  WhatsAppBillingError,
  WhatsAppDeliveryError,
  WhatsAppProvider,
  type SendWhatsAppRequest,
  type SendWhatsAppResult,
  type WhatsAppMessage,
  type WhatsAppProviderName,
} from '../domain/whatsapp-provider.port';

const GRAPH_API = 'https://graph.facebook.com';

/**
 * Meta's WhatsApp Cloud API, called directly rather than through a reseller.
 *
 * Direct because a BSP (MSG91, Gupshup, Interakt…) adds a per-message markup
 * and a second dashboard for what is, on our side, a single HTTPS call. No SDK,
 * for the reason every other adapter here gives: one endpoint does not justify
 * a dependency whose release cadence becomes ours.
 *
 * ## Templates, and why there are two
 *
 * Meta charges by template *category* and will not let one stand in for
 * another, so each logical message maps to its own approved template:
 * verification codes to an AUTHENTICATION template, receipts to a UTILITY one.
 *
 * ### Authentication
 *
 * Meta fixes the wording ("*123456* is your verification code…"), and the
 * template must have a copy-code button. Two consequences:
 *
 * - **The code is sent twice in the payload** — once for the body, once for the
 *   button. Meta rejects the message if the button parameter is missing, and
 *   the button is sent as `sub_type: "url"` even though it is a copy-code
 *   button. That is Meta's documented shape, not a mistake here.
 * - **Expiry is set on the template, not per message.** Configure the
 *   template's "code expires in" to match the 15 minutes the backend enforces,
 *   or the message will promise a lifetime the server does not honour.
 *
 * ### Utility (receipts)
 *
 * An ordinary template with four body parameters, whose wording we choose and
 * Meta approves. Positions are fixed by that approved wording, which is why
 * `templateFor` is the only place they appear — see `receiptParameters`.
 */
@Injectable()
export class MetaWhatsAppAdapter extends WhatsAppProvider {
  readonly name: WhatsAppProviderName = 'meta';

  private readonly logger = new Logger(MetaWhatsAppAdapter.name);

  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly otpTemplate: TemplateRef;
  /**
   * Optional, unlike the OTP template: receipts are an enhancement on top of a
   * purchase that has already completed, so a deployment may legitimately run
   * without one. `send` reports that clearly rather than calling Meta with an
   * undefined template name.
   */
  private readonly receiptTemplate: TemplateRef | null;

  constructor(config: AppConfig) {
    super();

    // Non-null: env validation refuses WHATSAPP_DRIVER=meta without these.
    const phoneNumberId = config.get('WHATSAPP_PHONE_NUMBER_ID')!;
    this.accessToken = config.get('WHATSAPP_ACCESS_TOKEN')!;
    this.endpoint = `${GRAPH_API}/${config.get('WHATSAPP_GRAPH_API_VERSION')}/${phoneNumberId}/messages`;
    this.otpTemplate = {
      name: config.get('WHATSAPP_OTP_TEMPLATE_NAME')!,
      language: config.get('WHATSAPP_OTP_TEMPLATE_LANGUAGE'),
    };

    const receiptName = config.get('WHATSAPP_RECEIPT_TEMPLATE_NAME');
    this.receiptTemplate = receiptName
      ? { name: receiptName, language: config.get('WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE') }
      : null;

    this.logger.log(
      `WhatsApp Cloud API configured (number=${phoneNumberId}, ` +
        `otpTemplate=${this.otpTemplate.name}, ` +
        `receiptTemplate=${this.receiptTemplate?.name ?? 'not configured'})`,
    );
  }

  async send(request: SendWhatsAppRequest): Promise<SendWhatsAppResult> {
    // Built before the try: a configuration problem here is not a network
    // failure, and wrapping it as one would send somebody looking at Meta's
    // status page for a missing environment variable.
    const template = this.templateFor(request.message);

    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: request.to,
          type: 'template',
          template,
        }),
        // Short: for a code, somebody is watching a form. A receipt has nobody
        // waiting, but it is sent after the money is taken and is best-effort,
        // so a slow call is better abandoned than left holding the request.
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new WhatsAppDeliveryError(`Could not reach the WhatsApp Cloud API: ${message}`, this.name);
    }

    const body = (await response.json().catch(() => null)) as GraphResponse | null;

    if (!response.ok || body?.error) {
      throw classifyGraphError(body?.error, response.status, this.name);
    }

    return { messageId: body?.messages?.[0]?.id ?? 'unknown', provider: this.name };
  }

  /** The only place a logical message becomes Meta's template shape. */
  private templateFor(message: WhatsAppMessage) {
    switch (message.kind) {
      case 'authentication-code':
        return {
          name: this.otpTemplate.name,
          language: { code: this.otpTemplate.language },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: message.code }] },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: message.code }],
            },
          ],
        };

      case 'purchase-receipt': {
        if (!this.receiptTemplate) {
          throw new WhatsAppDeliveryError(
            'No WhatsApp receipt template is configured (WHATSAPP_RECEIPT_TEMPLATE_NAME)',
            this.name,
          );
        }

        return {
          name: this.receiptTemplate.name,
          language: { code: this.receiptTemplate.language },
          components: [
            { type: 'body', parameters: receiptParameters(message) },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: libraryButtonSuffix(message.libraryUrl) }],
            },
          ],
        };
      }
    }
  }
}

interface TemplateRef {
  name: string;
  language: string;
}

/**
 * The receipt template's body parameters, in the order its approved wording
 * uses them: name, items, total, order number.
 *
 * Positional, because that is what Meta accepts — which is exactly why this
 * lives here and not at the call site. The caller passes named fields; if the
 * approved wording is ever reordered, this function changes and nothing else
 * does.
 */
function receiptParameters(message: Extract<WhatsAppMessage, { kind: 'purchase-receipt' }>) {
  return [message.buyerName, message.items, message.totalFormatted, message.orderNumber].map(
    (value) => ({ type: 'text', text: templateParameter(value) }),
  );
}

/**
 * The part of the library URL that goes into the template's button.
 *
 * Meta validates and fixes a button's domain when the template is approved, so
 * only the tail is variable — the template is configured as
 * `https://store.jsmf.me/{{1}}` and this supplies `library`. That also means
 * **the approved template's domain must match `APP_PUBLIC_URL`**: they are set
 * in two different places, and a mismatch sends buyers to the wrong site with
 * no error anywhere. Worth checking once, when the template is created.
 *
 * Falls back rather than throwing: a receipt pointing at the right place by
 * default beats no receipt at all for a purchase that really happened.
 *
 * Exported for tests.
 */
export function libraryButtonSuffix(libraryUrl: string): string {
  try {
    const url = new URL(libraryUrl);
    return `${url.pathname.replace(/^\//, '')}${url.search}` || 'library';
  } catch {
    return 'library';
  }
}

/**
 * Makes a value safe to send as a template parameter.
 *
 * Meta rejects the whole message — it does not trim — if a parameter contains a
 * newline, a tab, or four or more consecutive spaces. That is easy to trip over
 * here: the item summary is built from product titles, which are admin-entered
 * text that can contain anything. An empty parameter is refused too, so there
 * is a placeholder rather than a rejected receipt for a purchase that really
 * happened.
 *
 * Exported for tests.
 */
export function templateParameter(value: string): string {
  const flattened = value.replace(/\s+/g, ' ').trim();
  // 1024 is Meta's per-parameter ceiling; the ellipsis keeps a truncated title
  // from looking like the product's real name.
  return flattened ? flattened.slice(0, 1020) + (flattened.length > 1020 ? '…' : '') : '—';
}

interface GraphError {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_data?: { details?: string };
}

interface GraphResponse {
  messages?: { id: string }[];
  error?: GraphError;
}

/**
 * Meta error codes → something a caller can act on, with the fix in the log.
 *
 * Codes rather than wording, because Meta's codes are documented and stable
 * where its messages are not. Each hint names the fix, because Graph API
 * errors are notoriously hard to act on from the message alone.
 *
 * Exported for tests.
 */
export function classifyGraphError(
  error: GraphError | undefined,
  status: number,
  provider: WhatsAppProviderName,
): Error {
  const code = error?.code;
  const detail = [error?.message, error?.error_data?.details].filter(Boolean).join(' — ') ||
    `HTTP ${status}`;
  const described = (hint: string) => `WhatsApp refused the message (code ${code ?? '?'}): ${detail}. ${hint}`;

  // Payment problem on the WhatsApp Business Account. Not transient.
  if (code === 131042) {
    return new WhatsAppBillingError(
      described('Add or fix the payment method on the WhatsApp Business Account.'),
      provider,
    );
  }

  const hints: Record<number, string> = {
    190: 'The access token is invalid or expired — use a System User token, which does not expire.',
    131026: 'The recipient cannot receive WhatsApp messages on this number.',
    131030: 'The recipient is not in the test number\'s allowed list — add it in the Meta dashboard, or use a production number.',
    131047: 'Outside the 24-hour window — only approved templates can be sent.',
    131048: 'Meta is rate-limiting this number for spam signals.',
    131056: 'Too many messages to this recipient in a short time.',
    130429: 'Throughput limit reached — slow down.',
    132000: 'The template parameters do not match the approved template.',
    132001: 'The template does not exist in this language — check the name and language code.',
    132012: 'The template parameters are in the wrong format.',
    132015: 'The template is paused by Meta for low quality.',
    132016: 'The template has been disabled by Meta.',
  };

  return new WhatsAppDeliveryError(
    described(hints[code ?? -1] ?? 'See Meta\'s Cloud API error code reference.'),
    provider,
  );
}
