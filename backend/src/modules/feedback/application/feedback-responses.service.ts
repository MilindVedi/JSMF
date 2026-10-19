import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FeedbackFormStatus, FeedbackResponseSource } from '@prisma/client';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import { readInviteToken } from '../domain/feedback-link';
import {
  ANONYMOUS_ATTRIBUTION,
  acceptsReplies,
  cleanAnswers,
  type AnswerInput,
} from '../domain/feedback-rules';
import { sessionDisplayName } from '../../events/domain/session-display';
import { FeedbackAudience, type LoadedForm } from './feedback-audience';
import { FeedbackInvitesService } from './feedback-invites.service';

/**
 * Where the visitor stands with this form:
 *  - OPEN: they can fill it in (or change their reply).
 *  - PREVIEW: an admin looking at it. Shown, never saved.
 *  - SIGN_IN_REQUIRED: the shared link, opened signed out.
 *  - NOT_ELIGIBLE: signed in, but not someone this form asks.
 *  - CLOSED: no longer taking replies.
 */
export type FeedbackViewState = 'OPEN' | 'PREVIEW' | 'SIGN_IN_REQUIRED' | 'NOT_ELIGIBLE' | 'CLOSED';

/**
 * How the visitor is replying:
 *  - PERSONAL: as themselves, through the email's link or their signed-in account.
 *  - OPEN_LINK: the form's no-sign-in link, with a typed name and no account.
 * Null while there is nothing to fill in (sign-in needed, not eligible, preview).
 */
export type FeedbackReplyMode = 'PERSONAL' | 'OPEN_LINK';

export interface OpenReplyInput extends Omit<ReplyInput, 'token' | 'isAnonymous'> {
  respondentName: string;
  /** The browser's random key; only its hash is stored. */
  editKey: string;
}

export interface ReplyInput {
  /** The personal link's token, when the page was opened from an email. */
  token?: string;
  answers: AnswerInput[];
  isAnonymous?: boolean;
  consentToPublish?: boolean;
  /** "Show my first name with it on the website." Only read if the form asks. */
  showName?: boolean;
}

interface Visitor {
  /** From the signed-in session, if any. */
  user?: AuthenticatedUser;
  token?: string;
  /** The open link's browser key, to find this browser's earlier reply. */
  editKey?: string;
}

export const RESPONDENT_NAME_MAX = 80;

/**
 * The form as a student meets it on jsmf.me/feedback/<id>, and saving their
 * reply.
 *
 * Who is replying comes from one of two places, in this order:
 *  1. the personal link's token (the email): no sign-in needed, and it wins
 *     over a signed-in session, because the link names the person it was sent to;
 *  2. the signed-in account (the shared Telegram link).
 * Either way they must still be someone the form asks (FeedbackAudience), so a
 * refund takes the right to reply with it, and a forwarded link is only ever
 * good for its owner's own reply.
 *
 * With the form's `openLink` on, anyone else who opens the shared link may
 * reply too, under a name they type (OPEN_LINK). A seat holder who is signed
 * in still replies as themselves. Open replies have no account, so nothing
 * checks a seat or stops a second reply from another browser; the team sees
 * them marked as not verified.
 */
@Injectable()
export class FeedbackResponsesService {
  private readonly logger = new Logger(FeedbackResponsesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: FeedbackAudience,
    private readonly invites: FeedbackInvitesService,
  ) {}

  async view(formId: string, visitor: Visitor) {
    const form = await this.audience.loadForm(formId);
    const isStaff = visitor.user?.roles.some((role) => role === 'ADMIN' || role === 'EDUCATOR') ?? false;
    // A draft does not exist for students. Staff can preview it.
    if (!form || (form.status === FeedbackFormStatus.DRAFT && !isStaff)) {
      throw new NotFoundException('This feedback form does not exist, or is not open yet.');
    }

    const who = await this.identify(form, visitor);
    const base = { form: this.publicForm(form) };

    const closedOr = (open: FeedbackViewState) =>
      (acceptsReplies(form, new Date()) ? open : 'CLOSED') as FeedbackViewState;
    const nothing = { respondent: null, response: null, mode: null as FeedbackReplyMode | null };

    if (who?.via === 'invite') await this.markOpened(who.inviteId);
    const eligible = who ? await this.audience.isRespondent(form, who.userId) : false;

    if (!who || !eligible) {
      // Staff see a preview, never a form to send.
      if (isStaff) return { ...base, ...nothing, state: 'PREVIEW' as FeedbackViewState };
      if (form.openLink) return { ...base, ...(await this.openView(form.id, visitor.editKey)), state: closedOr('OPEN') };
      return { ...base, ...nothing, state: (who ? 'NOT_ELIGIBLE' : 'SIGN_IN_REQUIRED') as FeedbackViewState };
    }

    const response = await this.prisma.feedbackResponse.findUnique({
      where: { formId_userId: { formId, userId: who.userId } },
      include: { answers: true },
    });
    const user = await this.prisma.user.findUnique({ where: { id: who.userId }, select: { name: true } });

    return {
      ...base,
      state: closedOr('OPEN'),
      mode: 'PERSONAL' as FeedbackReplyMode,
      respondent: { firstName: firstName(user?.name ?? '') },
      response: response && {
        isAnonymous: response.isAnonymous,
        consentToPublish: response.consentToPublish,
        showName: response.showName,
        submittedAt: response.submittedAt,
        editedAt: response.editedAt,
        answers: response.answers.map((a) => ({
          questionId: a.questionId,
          rating: a.ratingValue,
          text: a.textValue,
          choices: a.choiceValues,
        })),
      },
    };
  }

  /** Saves a reply, or replaces the person's earlier one. */
  async submit(formId: string, visitor: Visitor, input: ReplyInput) {
    const form = await this.audience.loadForm(formId);
    if (!form || form.status === FeedbackFormStatus.DRAFT) {
      throw new NotFoundException('This feedback form does not exist, or is not open yet.');
    }
    if (!acceptsReplies(form, new Date())) {
      throw new BadRequestException('This feedback form has closed, so replies can no longer be saved or changed.');
    }

    const who = await this.identify(form, { ...visitor, token: input.token ?? visitor.token });
    if (!who) throw new ForbiddenException('Open the link from your email, or sign in, to give feedback.');
    if (!(await this.audience.isRespondent(form, who.userId))) {
      throw new ForbiddenException('This feedback form is only for people who attended the session.');
    }

    const { answers, errors } = cleanAnswers(form.questions, input.answers ?? []);
    if (errors.length) throw new BadRequestException(errors.join(' '));
    if (answers.length === 0) throw new BadRequestException('Answer at least one question before sending.');

    const isAnonymous = form.allowAnonymous && input.isAnonymous === true;
    const consentToPublish = form.askConsentToPublish && input.consentToPublish === true;
    const showName = form.askShowName ? input.showName === true : null;
    const source = who.via === 'invite' ? FeedbackResponseSource.EMAIL_LINK : FeedbackResponseSource.SIGNED_IN;
    const activeIds = form.questions.map((q) => q.id);

    const saved = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.feedbackResponse.findUnique({
        where: { formId_userId: { formId, userId: who.userId } },
        select: { id: true, isAnonymous: true, consentToPublish: true, showName: true },
      });

      const response = existing
        ? await tx.feedbackResponse.update({
            where: { id: existing.id },
            data: { isAnonymous, consentToPublish, showName, editedAt: new Date() },
          })
        : await tx.feedbackResponse.create({
            data: { formId, userId: who.userId, source, isAnonymous, consentToPublish, showName },
          });

      // Only this form's current questions are replaced: an answer to a
      // question since archived stays, so the results keep it.
      await tx.feedbackAnswer.deleteMany({ where: { responseId: response.id, questionId: { in: activeIds } } });
      await tx.feedbackAnswer.createMany({ data: answers.map((a) => ({ ...a, responseId: response.id })) });

      if (existing) {
        // Where the form asked for consent, taking it back takes the reply
        // off the website: it was picked under the old answer.
        if (form.askConsentToPublish && existing.consentToPublish && !consentToPublish) {
          await tx.feedbackHighlight.deleteMany({ where: { responseId: response.id } });
        }
        // Hiding their name from the team: the card stays, without the name.
        // (A changed "show my name" answer is only guidance; the admin decides.)
        if (!existing.isAnonymous && isAnonymous) {
          await tx.feedbackHighlight.updateMany({
            where: { responseId: response.id },
            data: { attribution: ANONYMOUS_ATTRIBUTION },
          });
        }
      }

      return { response, edited: existing !== null };
    });

    activity(this.logger, saved.edited ? 'feedback.reply_edited' : 'feedback.reply_saved', {
      formId,
      source,
      answers: answers.length,
    });
    return { submittedAt: saved.response.submittedAt, edited: saved.edited };
  }

  /**
   * Saves a reply on the no-sign-in link, or replaces this browser's earlier
   * one. Only when the form's `openLink` is on. "Hide my name" does not apply:
   * the name is whatever they typed, and there is no account to hide.
   */
  async submitOpen(formId: string, input: OpenReplyInput) {
    const form = await this.audience.loadForm(formId);
    if (!form || form.status === FeedbackFormStatus.DRAFT) {
      throw new NotFoundException('This feedback form does not exist, or is not open yet.');
    }
    if (!form.openLink) {
      throw new ForbiddenException('Open the link from your email, or sign in, to give feedback.');
    }
    if (!acceptsReplies(form, new Date())) {
      throw new BadRequestException('This feedback form has closed, so replies can no longer be saved or changed.');
    }

    const respondentName = (input.respondentName ?? '').replace(/\s+/g, ' ').trim();
    if (!respondentName) throw new BadRequestException('Enter your name before sending.');
    if (respondentName.length > RESPONDENT_NAME_MAX) {
      throw new BadRequestException(`Your name can be at most ${RESPONDENT_NAME_MAX} characters.`);
    }

    const { answers, errors } = cleanAnswers(form.questions, input.answers ?? []);
    if (errors.length) throw new BadRequestException(errors.join(' '));
    if (answers.length === 0) throw new BadRequestException('Answer at least one question before sending.');

    const consentToPublish = form.askConsentToPublish && input.consentToPublish === true;
    const showName = form.askShowName ? input.showName === true : null;
    const editKeyHash = hashEditKey(input.editKey);
    const activeIds = form.questions.map((q) => q.id);

    const saved = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.feedbackResponse.findUnique({
        where: { formId_editKeyHash: { formId, editKeyHash } },
        select: { id: true, consentToPublish: true },
      });

      const response = existing
        ? await tx.feedbackResponse.update({
            where: { id: existing.id },
            data: { respondentName, consentToPublish, showName, editedAt: new Date() },
          })
        : await tx.feedbackResponse.create({
            data: {
              formId,
              userId: null,
              source: FeedbackResponseSource.OPEN_LINK,
              respondentName,
              editKeyHash,
              consentToPublish,
              showName,
            },
          });

      await tx.feedbackAnswer.deleteMany({ where: { responseId: response.id, questionId: { in: activeIds } } });
      await tx.feedbackAnswer.createMany({ data: answers.map((a) => ({ ...a, responseId: response.id })) });

      // Taking consent back takes the reply off the website, as for any reply.
      if (existing && form.askConsentToPublish && existing.consentToPublish && !consentToPublish) {
        await tx.feedbackHighlight.deleteMany({ where: { responseId: response.id } });
      }
      return { response, edited: existing !== null };
    });

    activity(this.logger, saved.edited ? 'feedback.reply_edited' : 'feedback.reply_saved', {
      formId,
      source: FeedbackResponseSource.OPEN_LINK,
      answers: answers.length,
    });
    return { submittedAt: saved.response.submittedAt, edited: saved.edited };
  }

  // --- internals ----------------------------------------------------------------

  /** The open link's view: this browser's earlier reply, if its key finds one. */
  private async openView(formId: string, editKey?: string) {
    const response = editKey
      ? await this.prisma.feedbackResponse.findUnique({
          where: { formId_editKeyHash: { formId, editKeyHash: hashEditKey(editKey) } },
          include: { answers: true },
        })
      : null;
    return {
      mode: 'OPEN_LINK' as FeedbackReplyMode,
      respondent: null,
      response: response && {
        isAnonymous: false,
        respondentName: response.respondentName,
        consentToPublish: response.consentToPublish,
        showName: response.showName,
        submittedAt: response.submittedAt,
        editedAt: response.editedAt,
        answers: response.answers.map((a) => ({
          questionId: a.questionId,
          rating: a.ratingValue,
          text: a.textValue,
          choices: a.choiceValues,
        })),
      },
    };
  }

  private async identify(
    form: LoadedForm,
    visitor: Visitor,
  ): Promise<{ userId: string; via: 'invite'; inviteId: string } | { userId: string; via: 'account' } | null> {
    if (visitor.token) {
      const inviteId = readInviteToken(visitor.token, this.invites.linkKey());
      const invite = inviteId
        ? await this.prisma.feedbackInvite.findUnique({ where: { id: inviteId }, select: { formId: true, userId: true } })
        : null;
      // A bad or foreign token is not an error page: the person may still be
      // signed in, which is just as good.
      if (invite && invite.formId === form.id) return { userId: invite.userId, via: 'invite', inviteId: inviteId! };
    }
    if (visitor.user) return { userId: visitor.user.id, via: 'account' };
    return null;
  }

  private async markOpened(inviteId: string) {
    await this.prisma.feedbackInvite.updateMany({
      where: { id: inviteId, firstOpenedAt: null },
      data: { firstOpenedAt: new Date() },
    });
  }

  private publicForm(form: LoadedForm) {
    return {
      id: form.id,
      title: form.title,
      intro: form.intro,
      thankYouText: form.thankYouText,
      sessionTitle: sessionDisplayName(form.liveSession),
      dayLabel: this.audience.dayLabel(form),
      allowAnonymous: form.allowAnonymous,
      askConsentToPublish: form.askConsentToPublish,
      askShowName: form.askShowName,
      openLink: form.openLink,
      closesAt: form.closesAt,
      questions: form.questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        label: q.label,
        helpText: q.helpText,
        required: q.required,
        options: q.options,
      })),
    };
  }
}

function hashEditKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
