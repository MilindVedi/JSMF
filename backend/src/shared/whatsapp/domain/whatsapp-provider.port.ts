/**
 * WhatsApp messages behind a port — the same shape as mail and SMS.
 *
 * Business-initiated WhatsApp messages must use a template Meta has approved in
 * advance, and templates come in categories that Meta treats differently.
 * Nothing above this port should know those rules, so a request names a
 * *logical* message and the adapter maps it to whatever its vendor needs.
 *
 * Lives in `shared/` because WhatsApp is not an auth feature: verification
 * codes were merely the first message sent this way, and purchase receipts for
 * buyers who have no email are the second.
 *
 * See docs/identity/04-whatsapp-and-mobile-sign-in.md.
 */

/**
 * What is being sent, independent of any vendor's template naming.
 *
 * Each member names a *fact set*, not a layout: the fields are what the message
 * is about, and an adapter decides how its vendor wants them. On Meta that
 * means a template plus positional parameters, and the order of those
 * parameters is the adapter's business — callers must never have to know that
 * the total is parameter three.
 *
 * Meta also charges by template *category*, which is why these are separate
 * kinds rather than one generic "send text":
 *
 * - `authentication-code` → AUTHENTICATION: fixed wording, copy-code button,
 *   cheapest rate in India.
 * - `purchase-receipt` → UTILITY: about a transaction the person has already
 *   made. Cheap, but not the same template and not interchangeable — sending a
 *   receipt through an authentication template would be rejected, and getting
 *   the category wrong is a common way to have a template refused.
 *
 * A new message kind is a new member here plus a mapping in each adapter.
 */
export type WhatsAppMessage =
  | { kind: 'authentication-code'; code: string }
  | {
      kind: 'purchase-receipt';
      /** How to address them — a first name, not the full row. */
      buyerName: string;
      /** What they bought, already summarised to one line by the caller. */
      items: string;
      /** Display-ready, e.g. `₹199` — the adapter must not do currency maths. */
      totalFormatted: string;
      orderNumber: string;
      /**
       * Where the buyer's files are — the same library URL the email links to,
       * in full, including the origin.
       *
       * Full rather than a path because this is the fact the message is
       * carrying; how a vendor wants it expressed is the adapter's problem.
       * Meta's button takes only the part after the domain, since the domain
       * is fixed when the template is approved.
       *
       * **Never a direct download link.** A download URL is signed and
       * short-lived, and anyone the message is forwarded to could use it until
       * it expired. The library is behind a sign-in, which is what makes it
       * safe to put in a message.
       */
      libraryUrl: string;
    };

export interface SendWhatsAppRequest {
  /** E.164 digits without the `+` — always produced by `normalisePhoneNumber`. */
  to: string;
  message: WhatsAppMessage;
  /** A slug for logs — never prose. */
  tag?: string;
}

export interface SendWhatsAppResult {
  /** Meta's message id (`wamid.…`), which delivery-status webhooks refer to. */
  messageId: string;
  provider: WhatsAppProviderName;
}

export type WhatsAppProviderName = 'log' | 'meta';

/** An ordinary failure: bad token, unapproved template, rate limit, network. */
export class WhatsAppDeliveryError extends Error {
  constructor(
    message: string,
    readonly provider: WhatsAppProviderName,
  ) {
    super(message);
    this.name = 'WhatsAppDeliveryError';
  }
}

/**
 * The account cannot pay for messages — no payment method on the WhatsApp
 * Business Account, or its credit line is exhausted.
 *
 * Separate for the same reason as the mail quota and the SMS balance: retrying
 * cannot succeed until somebody fixes billing, so "try again shortly" would be
 * untrue, and the person should be pointed at another route instead.
 */
export class WhatsAppBillingError extends Error {
  constructor(
    message: string,
    readonly provider: WhatsAppProviderName,
  ) {
    super(message);
    this.name = 'WhatsAppBillingError';
  }
}

export abstract class WhatsAppProvider {
  abstract readonly name: WhatsAppProviderName;

  /**
   * Hands the message to the provider, or throws.
   *
   * Success means **accepted**, not delivered. Meta reports delivery later, by
   * webhook — a number with no WhatsApp account is usually only discovered
   * then. Callers must treat success as "it is on its way", which is why the
   * sign-in screen always offers a resend and, where configured, SMS.
   */
  abstract send(request: SendWhatsAppRequest): Promise<SendWhatsAppResult>;
}
