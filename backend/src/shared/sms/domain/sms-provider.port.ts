/**
 * Text messages behind a port, for the same reason email, storage and payments
 * are: the vendor is an implementation detail with a real chance of changing,
 * and nothing that *sends* a message should know whose API carried it.
 *
 * This lives in `shared/` rather than inside identity because SMS is not an
 * auth feature. One-time codes are simply the first thing that needs it; order
 * updates and delivery notices are the obvious next callers, and putting the
 * transport inside whichever module happened to need it first would mean every
 * later caller reaching across a module boundary.
 *
 * The provider is MSG91 because the alternative considered — Firebase phone
 * auth — charges per verification at roughly two orders of magnitude more for
 * Indian numbers, and would have required moving the whole identity system to
 * Firebase to use it. See docs/identity/03-sms-and-msg91.md.
 */

export interface SendSmsRequest {
  /**
   * E.164 without the leading `+` — `919876543210`. Normalisation is the
   * caller's job (`normalisePhoneNumber`), not each adapter's, so that a
   * number stored in the database and a number handed to a provider cannot
   * disagree about their format.
   */
  to: string;
  /**
   * The variables the provider's approved template expects, by name.
   *
   * Deliberately not a message body. Indian SMS is governed by TRAI's DLT
   * regime: the wording is registered with the regulator in advance and the
   * sender supplies only the blanks. An adapter for a country without that
   * constraint can render these into a body itself; the caller does not need
   * to know which world it is in.
   */
  variables: Record<string, string>;
  /** Groups related sends for provider-side reporting — a slug, not prose. */
  tag?: string;
}

export interface SendSmsResult {
  /** The provider's own id where it gives one, for tracing a delivery later. */
  messageId: string;
  provider: SmsProviderName;
}

export type SmsProviderName = 'log' | 'msg91';

/**
 * A send that failed for an ordinary reason: bad credentials, a template not
 * approved, a malformed number, a network fault.
 *
 * Carries the provider's own wording because that is usually the whole
 * diagnosis ("template not approved"). For the application log only — never a
 * response body, where it would tell a stranger about our SMS account.
 */
export class SmsDeliveryError extends Error {
  constructor(
    message: string,
    readonly provider: SmsProviderName,
  ) {
    super(message);
    this.name = 'SmsDeliveryError';
  }
}

/**
 * The account is out of credit.
 *
 * Separate from `SmsDeliveryError` for the same reason mail separates quota:
 * it is neither a bug nor transient. Nothing is misconfigured, retrying cannot
 * succeed, and the response is to top up. Keeping it distinct is what lets the
 * flow above answer "try another way" instead of "try again shortly".
 *
 * Unlike email, SMS is prepaid rather than windowed — there is no reset at
 * midnight, so this stays true until somebody pays. That makes classifying it
 * correctly more important here, not less: telling a buyer to retry later when
 * the balance is zero leaves them locked out indefinitely.
 */
export class SmsBalanceExhaustedError extends Error {
  constructor(
    message: string,
    readonly provider: SmsProviderName,
  ) {
    super(message);
    this.name = 'SmsBalanceExhaustedError';
  }
}

export abstract class SmsProvider {
  abstract readonly name: SmsProviderName;

  /**
   * Delivers, or throws. Implementations must not swallow failures — a caller
   * that needs to know a code never arrived cannot find out from a silently
   * ignored error.
   */
  abstract send(request: SendSmsRequest): Promise<SendSmsResult>;
}
