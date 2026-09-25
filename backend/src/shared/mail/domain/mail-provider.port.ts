/**
 * Email delivery behind a port, for the same reason storage and payments are:
 * the provider is an implementation detail with a real chance of changing, and
 * nothing that *sends* an email should know whether it went out over SMTP, an
 * HTTP API, or straight to a log file in development.
 *
 * This lives in `shared/` rather than under a feature module because email is
 * cross-cutting: admin registration needs it today, and password reset, email
 * verification, receipts and refund notifications all need it next. Putting it
 * inside whichever feature happened to need it first would mean every later
 * caller reaching across a module boundary to get at it.
 */

export interface MailAddress {
  email: string;
  name?: string;
}

export interface SendMailRequest {
  to: MailAddress | MailAddress[];
  subject: string;
  /** Always required. A text/plain part is what makes mail readable in clients that refuse HTML, and its absence is a common spam signal. */
  text: string;
  html?: string;
  replyTo?: MailAddress;
  /**
   * Groups related sends for provider-side reporting. Not the subject — a
   * stable identifier like `admin-registration-code`.
   */
  tag?: string;
}

export interface SendMailResult {
  /** The provider's own id, when it gives one — for tracing a delivery later. */
  messageId: string;
  /** Which adapter actually sent it, so logs are unambiguous in mixed setups. */
  provider: MailProviderName;
}

export type MailProviderName = 'log' | 'smtp' | 'resend';

export abstract class MailProvider {
  abstract readonly name: MailProviderName;

  /**
   * Delivers a message, or throws.
   *
   * Implementations must not swallow failures: a caller that needs to know an
   * OTP never arrived cannot find out from a silently-ignored error. Callers
   * that genuinely do not care (a best-effort notification) catch it
   * themselves, which makes that decision visible at the call site.
   */
  abstract send(request: SendMailRequest): Promise<SendMailResult>;
}
