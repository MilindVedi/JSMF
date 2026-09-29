import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/config.module';
import {
  SmsBalanceExhaustedError,
  SmsDeliveryError,
  SmsProvider,
  type SendSmsRequest,
  type SendSmsResult,
  type SmsProviderName,
} from '../domain/sms-provider.port';

const MSG91_FLOW_API = 'https://control.msg91.com/api/v5/flow';

/**
 * MSG91's Flow API, over HTTP directly.
 *
 * No SDK, for the reason the Razorpay and Resend adapters give: the surface
 * actually used is a single endpoint, and a package wrapping one `fetch` is a
 * dependency whose release cadence becomes ours.
 *
 * **Flow, not the OTP API.** MSG91 also offers an endpoint that generates,
 * stores and verifies a code itself. That is the wrong shape here: the code is
 * already issued by `VerificationCodeService`, hashed, attempt-limited and tied
 * to a purpose, and the same code has to be verifiable whether it travelled by
 * email or by SMS. Letting MSG91 own the code for one channel would mean two
 * different notions of what a valid code is, and would make "your email failed,
 * use your mobile instead" impossible — the whole point of the channel port is
 * that both routes carry *the same* code.
 *
 * ## DLT, and why there is no message body here
 *
 * Indian SMS is regulated: TRAI's DLT regime requires the exact wording to be
 * registered with the regulator and approved before a single message sends.
 * The sender then supplies only the template id and the blanks. So this adapter
 * cannot compose a message even if it wanted to — `MSG91_OTP_TEMPLATE_ID` names
 * the approved wording, and `variables` fills it in.
 *
 * The registered template must use the variable names this application sends:
 *
 * ```
 * {{OTP}} is your JSMF verification code. It is valid for {{EXPIRY}} minutes.
 * Do not share it with anyone.
 * ```
 *
 * A mismatch between the registered variable names and these is the most
 * common way this fails, and it fails as a rejected send rather than a blank
 * message — which is the better of the two outcomes, and the reason the error
 * below quotes MSG91's own wording.
 */
@Injectable()
export class Msg91SmsAdapter extends SmsProvider {
  readonly name: SmsProviderName = 'msg91';

  private readonly logger = new Logger(Msg91SmsAdapter.name);

  private readonly authKey: string;
  private readonly templateId: string;
  private readonly senderId?: string;

  constructor(config: AppConfig) {
    super();

    // Non-null: env validation refuses to boot with SMS_DRIVER=msg91 and
    // either of these missing, so reaching here without them is impossible.
    this.authKey = config.get('MSG91_AUTH_KEY')!;
    this.templateId = config.get('MSG91_OTP_TEMPLATE_ID')!;
    this.senderId = config.get('MSG91_SENDER_ID') || undefined;

    this.logger.log(`MSG91 configured (template=${this.templateId})`);
  }

  async send(request: SendSmsRequest): Promise<SendSmsResult> {
    let response: Response;

    try {
      response = await fetch(MSG91_FLOW_API, {
        method: 'POST',
        headers: {
          authkey: this.authKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          template_id: this.templateId,
          // Optional: the DLT-approved header the message appears to come
          // from. Left out when unset, because MSG91 falls back to the
          // template's own sender and an empty string is rejected outright.
          sender: this.senderId,
          // Without this MSG91 accepts the request and reports only that it was
          // queued, so a rejected number or an unapproved template would look
          // like a success here and vanish silently.
          realTimeResponse: '1',
          short_url: '0',
          recipients: [{ mobiles: request.to, ...request.variables }],
        }),
        // Shorter than the mail timeout: a person is sitting on a form waiting
        // for this, and a code that arrives after they have given up is worth
        // no more than one that never came.
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new SmsDeliveryError(`Could not reach MSG91: ${message}`, this.name);
    }

    const body = (await response.json().catch(() => null)) as Msg91Response | null;

    if (!response.ok || body?.type === 'error') {
      const message = body?.message ?? `HTTP ${response.status}`;
      throw classify(message, this.name);
    }

    return {
      // MSG91 returns the request id here; it is what their dashboard's
      // delivery report is searched by.
      messageId: body?.message ?? 'unknown',
      provider: this.name,
    };
  }
}

interface Msg91Response {
  type?: 'success' | 'error';
  message?: string;
}

/**
 * Splits "top up the account" from "something is broken".
 *
 * The distinction reaches the buyer: a balance failure means the alternative
 * channel or a later attempt, while an ordinary error is worth retrying now.
 * MSG91 signals the former only in the wording of the message, which is why
 * this matches on text — brittle, but the alternative is telling someone to
 * "try again shortly" when no message will send until somebody pays.
 */
function classify(message: string, provider: SmsProviderName): Error {
  if (/balance|insufficient|credit|recharge/i.test(message)) {
    return new SmsBalanceExhaustedError(`MSG91 has no balance: ${message}`, provider);
  }

  return new SmsDeliveryError(`MSG91 refused the message: ${message}`, provider);
}
