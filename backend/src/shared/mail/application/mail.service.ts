import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { EmailDeliveryStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MailDeliveryError,
  MailProvider,
  MailQuotaExceededError,
  type SendMailRequest,
} from '../domain/mail-provider.port';

/**
 * What a caller is told when a send fails. Deliberately says nothing about the
 * provider or the reason: "Resend daily limit exceeded" describes our billing
 * arrangement, not the user's problem, and a stranger has no business learning
 * which vendor we use or how close to its ceiling we are.
 */
const SAFE_FAILURE_MESSAGE =
  'We could not send that email right now. Please try again in a little while.';

export interface MailUsage {
  sentToday: number;
  sentThisMonth: number;
  dailyQuota: number;
  monthlyQuota: number;
}

export type BestEffortOutcome =
  | { delivered: true; messageId: string }
  | { delivered: false; reason: 'quota' | 'error' };

/**
 * Sending email, with the two things every caller of the raw port otherwise
 * has to reinvent: a record of what happened, and a decision about whether a
 * failed send should take the surrounding operation down with it.
 *
 * The split is deliberate and is the whole point of this class:
 *
 * - `send` is for mail that *is* the feature. An admin invitation nobody
 *   receives is not a partial success, it is a broken invitation, so the
 *   failure propagates and the caller's operation fails.
 *
 * - `sendBestEffort` is for mail that merely accompanies something that already
 *   happened. The account exists; the payment cleared; the entitlement is
 *   granted. Refusing to acknowledge that because a receipt bounced would take
 *   a working signup or a completed purchase and turn it into an error the user
 *   cannot act on — and, for a purchase, one they have already paid for.
 *
 * Both record to `email_deliveries`, which exists because no provider reports
 * remaining allowance (see the model's own comment).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly provider: MailProvider,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Sends, or throws. The thrown message is safe to return to a caller; the
   * provider's own diagnosis goes to the log and the delivery record instead.
   */
  async send(request: SendMailRequest): Promise<{ messageId: string }> {
    const outcome = await this.attempt(request);

    if (outcome.delivered) return { messageId: outcome.messageId };

    throw new ServiceUnavailableException(SAFE_FAILURE_MESSAGE);
  }

  /**
   * Sends, and never throws. The caller gets the outcome and is free to ignore
   * it — which is the correct response when the thing the email describes has
   * already succeeded and cannot be undone.
   */
  async sendBestEffort(request: SendMailRequest): Promise<BestEffortOutcome> {
    try {
      return await this.attempt(request);
    } catch (cause) {
      // attempt() already swallows provider failures; reaching here means the
      // recording itself broke. A database hiccup writing a log row must not
      // be the thing that fails a completed purchase.
      this.logger.error(
        `Could not complete a best-effort send: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return { delivered: false, reason: 'error' };
    }
  }

  /** Today's and this month's counts against the configured allowances. */
  async usage(): Promise<MailUsage> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [sentToday, sentThisMonth] = await Promise.all([
      this.countSentSince(startOfDay),
      this.countSentSince(startOfMonth),
    ]);

    return {
      sentToday,
      sentThisMonth,
      dailyQuota: this.config.get('MAIL_DAILY_QUOTA'),
      monthlyQuota: this.config.get('MAIL_MONTHLY_QUOTA'),
    };
  }

  // --- internals ----------------------------------------------------------

  private async attempt(request: SendMailRequest): Promise<BestEffortOutcome> {
    const recipient = (Array.isArray(request.to) ? request.to : [request.to])
      .map((address) => address.email)
      .join(', ');

    try {
      const result = await this.provider.send(request);

      await this.record({
        recipient,
        tag: request.tag,
        status: EmailDeliveryStatus.SENT,
        providerMessageId: result.messageId,
      });

      await this.logUsage(request.tag);

      return { delivered: true, messageId: result.messageId };
    } catch (cause) {
      const quota = cause instanceof MailQuotaExceededError;
      const detail =
        cause instanceof MailDeliveryError || quota
          ? (cause as Error).message
          : cause instanceof Error
            ? cause.message
            : String(cause);

      await this.record({
        recipient,
        tag: request.tag,
        status: quota ? EmailDeliveryStatus.QUOTA_EXCEEDED : EmailDeliveryStatus.FAILED,
        error: detail,
      });

      if (quota) {
        // Loud, and distinct from an ordinary delivery failure: this one is not
        // a bug to chase but a plan to upgrade, and every email after it will
        // fail the same way until the window resets.
        const { sentToday, dailyQuota, sentThisMonth, monthlyQuota } = await this.usage();
        this.logger.error(
          `MAIL QUOTA EXCEEDED — ${sentToday}/${dailyQuota} today, ` +
            `${sentThisMonth}/${monthlyQuota} this month. Further email will not be delivered ` +
            `until the allowance resets. Upgrade the plan to raise it.`,
        );
      } else {
        this.logger.error(
          `Email delivery failed via ${this.provider.name}${request.tag ? ` (${request.tag})` : ''}: ${detail}`,
        );
      }

      return { delivered: false, reason: quota ? 'quota' : 'error' };
    }
  }

  /**
   * Recording must never be what breaks a send: the email has already gone out
   * by this point, and losing the row is a lesser failure than telling the
   * caller the delivery failed when it did not.
   */
  private async record(input: {
    recipient: string;
    tag?: string;
    status: EmailDeliveryStatus;
    providerMessageId?: string;
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.emailDelivery.create({
        data: {
          provider: this.provider.name,
          tag: input.tag ?? null,
          recipient: input.recipient.slice(0, 255),
          status: input.status,
          providerMessageId: input.providerMessageId ?? null,
          error: input.error?.slice(0, 500) ?? null,
        },
      });
    } catch (cause) {
      this.logger.error(
        `Could not record email delivery: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  /** The running count after each successful send, for the upgrade decision. */
  private async logUsage(tag?: string): Promise<void> {
    try {
      const { sentToday, dailyQuota, sentThisMonth, monthlyQuota } = await this.usage();

      const line =
        `Email sent via ${this.provider.name}${tag ? ` (${tag})` : ''} — ` +
        `${sentToday}/${dailyQuota} today, ${sentThisMonth}/${monthlyQuota} this month`;

      // Warn rather than log once most of the allowance is gone, so the ceiling
      // is visible before it is hit rather than only once mail stops arriving.
      if (sentToday >= dailyQuota * 0.8 || sentThisMonth >= monthlyQuota * 0.8) {
        this.logger.warn(`${line} — approaching the limit`);
      } else {
        this.logger.log(line);
      }
    } catch {
      // Counting is observability, not delivery. Never let it surface.
    }
  }

  private countSentSince(since: Date): Promise<number> {
    return this.prisma.emailDelivery.count({
      where: { status: EmailDeliveryStatus.SENT, createdAt: { gte: since } },
    });
  }
}
