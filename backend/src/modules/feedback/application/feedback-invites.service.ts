import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FeedbackEmailMode, FeedbackFormStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { activity } from '../../../shared/logging/activity';
import { MailService } from '../../../shared/mail/application/mail.service';
import { feedbackInvite } from '../../../shared/mail/templates/feedback-templates';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { feedbackLinkKey, signInviteToken } from '../domain/feedback-link';
import { acceptsReplies, emailDueAt } from '../domain/feedback-rules';
import { sessionDisplayName } from '../../events/domain/session-display';
import { FeedbackAudience, type LoadedForm, type Respondent } from './feedback-audience';

/** One seat holder's row in the admin's "who has been asked" table. */
export interface FeedbackPersonRow {
  userId: string;
  name: string;
  email: string | null;
  joinedAt: Date;
  emailedAt: Date | null;
  emailCount: number;
  lastError: string | null;
  openedAt: Date | null;
  /** When they replied. Null if they have not, or replied anonymously (the table does not say who). */
  respondedAt: Date | null;
  /** Replied, whether or not anonymously. Lets the table stop offering a reminder. */
  responded: boolean;
}

export interface FeedbackSendResult {
  attempted: number;
  sent: number;
  /** Chosen but left alone: already replied, already emailed (for "new only"), no seat, or mid-send elsewhere. */
  skipped: number;
  failed: Array<{ userId: string; name: string; email: string | null; reason: string }>;
}

/** A claim older than this is from a send that died midway, and is taken over. */
const CLAIM_MS = 3 * 60_000;
/** The automatic email gives up on an address after this many failures; an admin can still retry. */
const AUTO_MAX_ATTEMPTS = 3;

const REASONS = {
  quota: "Today's email limit is used up. It will be retried.",
  error: 'The email could not be sent.',
  noEmail: 'This account has no email address.',
} as const;

/**
 * Who has been asked to fill in a form, and the asking itself.
 *
 * Every seat holder the form is for gets a `feedback_invites` row (made on
 * demand, never ahead), which is where their personal link's id, their email
 * status and when they first opened it are kept. Emails go out two ways that
 * share one code path:
 *  - automatically, on the 5-minute sweep, once the form's day has ended (plus
 *    its delay) — for an open form in AUTO_AFTER_DAY mode, to everyone not yet
 *    emailed;
 *  - by hand, from the admin's table — to everyone not yet emailed, or as a
 *    reminder to everyone who has not replied, or to chosen people.
 * Nobody who has replied is ever emailed again.
 *
 * Email is best-effort, the platform rule: a failure is recorded on the row,
 * shown to the admin, and never fails the action around it.
 */
@Injectable()
export class FeedbackInvitesService implements OnModuleInit {
  private readonly logger = new Logger(FeedbackInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: FeedbackAudience,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly sweeps: SweepRegistry,
  ) {}

  onModuleInit(): void {
    this.sweeps.register({ name: 'feedbackInvites', run: () => this.sendDue() });
  }

  /** The admin's table: every seat holder the form is for, and where each one stands. */
  async people(sessionId: string, formId: string) {
    const form = await this.audience.loadFormOf(sessionId, formId);
    const respondents = await this.audience.respondents(form);
    const invites = await this.ensureInvites(form.id, respondents);
    const responses = await this.prisma.feedbackResponse.findMany({
      where: { formId },
      select: { userId: true, submittedAt: true, isAnonymous: true },
    });
    const responseOf = new Map(responses.map((r) => [r.userId, r]));

    const rows: FeedbackPersonRow[] = respondents.map((person) => {
      const invite = invites.get(person.userId)!;
      const response = responseOf.get(person.userId);
      return {
        userId: person.userId,
        name: person.name,
        email: person.email,
        joinedAt: person.joinedAt,
        emailedAt: invite.emailedAt,
        emailCount: invite.emailCount,
        lastError: invite.lastError,
        openedAt: invite.firstOpenedAt,
        // An anonymous reply is counted, never dated against a name: the date
        // next to someone's row would say who wrote the anonymous one.
        respondedAt: response && !response.isAnonymous ? response.submittedAt : null,
        responded: response !== undefined,
      };
    });

    return {
      rows,
      total: rows.length,
      emailed: rows.filter((r) => r.emailedAt).length,
      opened: rows.filter((r) => r.openedAt).length,
      responded: rows.filter((r) => r.responded).length,
      /** Replies from people who no longer hold a seat (refunded), still counted in the results. */
      otherResponses: responses.filter((r) => r.userId && !rows.some((row) => row.userId === r.userId)).length,
      /** Replies on the no-sign-in link: no account, so not in the table above. */
      openLinkResponses: responses.filter((r) => !r.userId).length,
    };
  }

  /**
   * Emails personal links. With no `userIds`: everyone not yet emailed, or —
   * with `includeAlreadyEmailed` — everyone who has not replied (a reminder).
   * With `userIds`: exactly those people, reminded if already emailed.
   * Anyone who has replied is skipped either way, so pressing twice is safe.
   */
  async send(
    sessionId: string,
    formId: string,
    options: { userIds?: string[]; includeAlreadyEmailed?: boolean } = {},
  ): Promise<FeedbackSendResult> {
    const form = await this.audience.loadFormOf(sessionId, formId);
    if (!acceptsReplies(form, new Date())) {
      throw new BadRequestException(
        form.status === FeedbackFormStatus.DRAFT
          ? 'Open the form before emailing it. Until then it is a draft nobody can fill in.'
          : 'This form is closed, so nobody can fill it in. Reopen it first.',
      );
    }
    const chosen = options.userIds?.length ? new Set(options.userIds) : null;
    return this.deliver(form, {
      pick: (invite) => (chosen ? chosen.has(invite.userId) : options.includeAlreadyEmailed || !invite.emailedAt),
      chosenCount: chosen?.size,
    });
  }

  /**
   * The sweep: every open AUTO_AFTER_DAY form whose email is due, to everyone
   * not yet emailed. Failed addresses are retried on later ticks, a few times.
   */
  async sendDue() {
    const now = new Date();
    const candidates = await this.prisma.feedbackForm.findMany({
      where: {
        status: FeedbackFormStatus.OPEN,
        emailMode: FeedbackEmailMode.AUTO_AFTER_DAY,
        OR: [{ closesAt: null }, { closesAt: { gt: now } }],
      },
      select: { id: true },
    });

    let forms = 0;
    let sent = 0;
    let failed = 0;
    for (const { id } of candidates) {
      const form = await this.audience.loadForm(id);
      if (!form) continue;
      const due = emailDueAt(this.audience.endsAt(form), form.emailDelayMinutes);
      if (!due || due.getTime() > now.getTime()) continue;

      forms += 1;
      const result = await this.deliver(form, {
        pick: (invite) => !invite.emailedAt && invite.attempts < AUTO_MAX_ATTEMPTS,
      });
      sent += result.sent;
      failed += result.failed.length;
    }
    return { forms, sent, failed };
  }

  /** The personal link for one invite. */
  linkFor(formId: string, inviteId: string): string {
    const base = this.config.get('MAIN_WEBSITE_URL').replace(/\/$/, '');
    return `${base}/feedback/${formId}?k=${encodeURIComponent(signInviteToken(inviteId, this.linkKey()))}`;
  }

  /** The link anyone in the Telegram group can use; it asks them to sign in. */
  shareLinkFor(formId: string): string {
    return `${this.config.get('MAIN_WEBSITE_URL').replace(/\/$/, '')}/feedback/${formId}`;
  }

  linkKey(): string {
    return feedbackLinkKey({
      dedicated: this.config.get('FEEDBACK_LINK_SECRET'),
      storageSigningSecret: this.config.get('STORAGE_SIGNING_SECRET'),
    });
  }

  /** Makes sure each respondent has an invite row, and returns them by user. */
  async ensureInvites(formId: string, respondents: Array<Pick<Respondent, 'userId'>>) {
    if (respondents.length) {
      await this.prisma.feedbackInvite.createMany({
        data: respondents.map((r) => ({ formId, userId: r.userId })),
        skipDuplicates: true,
      });
    }
    const invites = await this.prisma.feedbackInvite.findMany({
      where: { formId, userId: { in: respondents.map((r) => r.userId) } },
    });
    return new Map(invites.map((invite) => [invite.userId, invite]));
  }

  // --- internals ----------------------------------------------------------------

  private async deliver(
    form: LoadedForm,
    options: {
      pick: (invite: { userId: string; emailedAt: Date | null; attempts: number }) => boolean;
      chosenCount?: number;
    },
  ): Promise<FeedbackSendResult> {
    const respondents = await this.audience.respondents(form);
    const invites = await this.ensureInvites(form.id, respondents);
    const replied = new Set(
      (await this.prisma.feedbackResponse.findMany({ where: { formId: form.id }, select: { userId: true } })).map(
        (r) => r.userId,
      ),
    );
    const dayLabel = this.audience.dayLabel(form);

    let sent = 0;
    let skipped = 0;
    const failed: FeedbackSendResult['failed'] = [];

    for (const person of respondents) {
      const invite = invites.get(person.userId)!;
      if (!options.pick(invite)) continue;
      if (replied.has(person.userId) || !(await this.claim(invite.id))) {
        skipped += 1;
        continue;
      }

      let reason: string | null = null;
      if (!person.email) {
        reason = REASONS.noEmail;
      } else {
        const rendered = feedbackInvite({
          attendeeName: firstName(person.name),
          sessionTitle: sessionDisplayName(form.liveSession),
          dayLabel,
          formUrl: this.linkFor(form.id, invite.id),
          reminder: invite.emailCount > 0,
          showNotSpamNotice: form.liveSession.showNotSpamNotice,
        });
        const outcome = await this.mail.sendBestEffort({
          to: { email: person.email, name: person.name },
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          tag: 'feedback-invite',
        });
        if (!outcome.delivered) reason = REASONS[outcome.reason];
      }

      await this.record(invite.id, reason);
      if (reason) failed.push({ userId: person.userId, name: person.name, email: person.email, reason });
      else sent += 1;
    }

    // People chosen by id who are not (or no longer) seat holders for this form.
    if (options.chosenCount !== undefined) {
      skipped += Math.max(0, options.chosenCount - sent - failed.length - skipped);
    }

    if (sent || failed.length) {
      activity(this.logger, 'feedback.invites_sent', { formId: form.id, sent, failed: failed.length, skipped });
    }
    return { attempted: sent + failed.length, sent, skipped, failed };
  }

  /**
   * Takes the row for this send. Fails while another send is emailing the
   * same person, which is what keeps a sweep and an admin click (or two
   * instances) from emailing them twice. `record` lets go of it.
   */
  private async claim(inviteId: string): Promise<boolean> {
    const now = new Date();
    const { count } = await this.prisma.feedbackInvite.updateMany({
      where: {
        id: inviteId,
        OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - CLAIM_MS) } }],
      },
      data: { claimedAt: now },
    });
    return count === 1;
  }

  private async record(inviteId: string, error: string | null) {
    try {
      await this.prisma.feedbackInvite.update({
        where: { id: inviteId },
        data: error
          ? { attempts: { increment: 1 }, lastError: error.slice(0, 500), claimedAt: null }
          : {
              attempts: { increment: 1 },
              lastError: null,
              emailedAt: new Date(),
              emailCount: { increment: 1 },
              claimedAt: null,
            },
      });
    } catch (cause) {
      // Bookkeeping only: the email has already gone (or failed) either way.
      this.logger.error(
        `Could not record feedback invite ${inviteId}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
