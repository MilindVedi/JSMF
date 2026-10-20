import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackEmailMode, FeedbackFormStatus, FeedbackQuestionKind } from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DEFAULT_TEMPLATE, FEEDBACK_TEMPLATES, templateByKey } from '../domain/default-questions';
import {
  MAX_QUESTIONS,
  cleanOptions,
  emailDueAt,
  formEndsAt,
  questionProblems,
  type QuestionDraft,
} from '../domain/feedback-rules';
import { summarise } from '../domain/feedback-summary';
import { FeedbackAudience, type LoadedForm } from './feedback-audience';
import { FeedbackInvitesService } from './feedback-invites.service';

type Actor = { id: string; ip?: string | null };

export interface FormSettingsInput {
  title?: string;
  intro?: string | null;
  thankYouText?: string | null;
  dayId?: string | null;
  status?: FeedbackFormStatus;
  emailMode?: FeedbackEmailMode;
  emailDelayMinutes?: number;
  allowAnonymous?: boolean;
  askConsentToPublish?: boolean;
  askShowName?: boolean;
  openLink?: boolean;
  closesAt?: string | null;
}

export interface QuestionInput extends QuestionDraft {
  /** Present for a question already on the form; absent for a new one. */
  id?: string;
}

/** "" from a cleared form field means "remove it", the same as null. */
const blankToNull = (value: string | null | undefined) => (value === '' ? null : value?.trim());

/**
 * Feedback forms as the admin builds and reads them: create (blank, from the
 * standard questions, or copied from another form), edit settings and
 * questions, open and close, and the results.
 *
 * The rule that shapes question editing: an answered question keeps its
 * meaning. Its kind cannot change, and removing it archives it rather than
 * deleting it, so the results still show what people said to it.
 */
@Injectable()
export class FeedbackFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: FeedbackAudience,
    private readonly invites: FeedbackInvitesService,
    private readonly audit: AuditService,
  ) {}

  /** Every form on a session, newest first, with its headline numbers. */
  async list(sessionId: string) {
    const session = await this.sessionOrThrow(sessionId);
    const forms = await this.prisma.feedbackForm.findMany({
      where: { liveSessionId: sessionId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { responses: true } },
        questions: { where: { kind: FeedbackQuestionKind.RATING, archivedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });

    const firstRatingIds = forms.map((f) => f.questions[0]?.id).filter((id): id is string => Boolean(id));
    const averages = firstRatingIds.length
      ? await this.prisma.feedbackAnswer.groupBy({
          by: ['questionId'],
          where: { questionId: { in: firstRatingIds } },
          _avg: { ratingValue: true },
        })
      : [];
    const averageOf = new Map(averages.map((a) => [a.questionId, a._avg.ratingValue]));

    return forms.map((form) => {
      const ratingId = form.questions[0]?.id;
      const average = ratingId ? averageOf.get(ratingId) : null;
      return {
        id: form.id,
        title: form.title,
        dayId: form.dayId,
        dayNumber: dayNumber(form.dayId, session.days),
        status: form.status,
        emailMode: form.emailMode,
        responses: form._count.responses,
        averageRating: average == null ? null : Math.round(average * 10) / 10,
        emailDueAt: emailDueAt(formEndsAt(form.dayId, session.days), form.emailDelayMinutes),
        createdAt: form.createdAt,
      };
    });
  }

  /** The ready-made forms, for the "start from" picker. */
  templates() {
    return FEEDBACK_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      questions: t.questions.length,
    }));
  }

  /**
   * Every form on every session, newest first: what a new form can be
   * imported from. An admin's own templates are simply earlier forms.
   */
  async importable() {
    const forms = await this.prisma.feedbackForm.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        createdAt: true,
        liveSessionId: true,
        liveSession: { select: { product: { select: { title: true } } } },
        _count: { select: { questions: { where: { archivedAt: null } } } },
      },
    });
    return forms.map((f) => ({
      id: f.id,
      title: f.title,
      sessionId: f.liveSessionId,
      sessionTitle: f.liveSession.product.title,
      questions: f._count.questions,
      createdAt: f.createdAt,
    }));
  }

  /**
   * A new form, always a draft. Starts from, in this order: another form's
   * questions and settings (`copyFromFormId`, from any session), a ready-made
   * template (`templateKey`), or the standard template.
   */
  async create(
    sessionId: string,
    input: { title?: string; dayId?: string | null; copyFromFormId?: string | null; templateKey?: string | null },
    actor: Actor,
  ) {
    const session = await this.sessionOrThrow(sessionId);
    this.checkDay(input.dayId, session.days);

    const source = input.copyFromFormId ? await this.audience.loadForm(input.copyFromFormId) : null;
    if (input.copyFromFormId && !source) throw new NotFoundException('The form to copy was not found.');
    const template = input.templateKey ? templateByKey(input.templateKey) : DEFAULT_TEMPLATE;
    if (!template) throw new BadRequestException('That template does not exist.');

    const questions: QuestionDraft[] = source
      ? source.questions.map((q) => ({ kind: q.kind, label: q.label, helpText: q.helpText, required: q.required, options: q.options }))
      : template.questions;
    const number = dayNumber(input.dayId ?? null, session.days);
    const dayName = number ? `Day ${number}` : 'Session';
    // A copy takes the questions, not the title: "Day 1 feedback" copied
    // onto Day 2 would be wrong.
    const title = input.title?.trim() || (source ? `${dayName} feedback` : template.title.replace('{day}', dayName));

    const form = await this.prisma.feedbackForm.create({
      data: {
        liveSessionId: sessionId,
        dayId: input.dayId ?? null,
        title,
        intro: source ? source.intro : (template.intro ?? null),
        thankYouText: source?.thankYouText ?? null,
        emailMode: source?.emailMode,
        emailDelayMinutes: source?.emailDelayMinutes,
        allowAnonymous: source?.allowAnonymous,
        askConsentToPublish: source?.askConsentToPublish,
        askShowName: source?.askShowName,
        // On for a new form; a copy keeps whatever the form it was copied from has.
        openLink: source ? source.openLink : true,
        createdById: actor.id,
        questions: {
          create: questions.map((q, sortOrder) => ({
            kind: q.kind,
            label: q.label,
            helpText: q.helpText ?? null,
            required: q.required ?? false,
            options: cleanOptions(q),
            sortOrder,
          })),
        },
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'feedback_form.created',
      entityType: 'feedback_form',
      entityId: form.id,
      after: { ...form, copiedFrom: source?.id ?? null, template: source ? null : template.key },
      ip: actor.ip,
    });
    return this.detail(sessionId, form.id);
  }

  /** One form for its editor: settings, current questions, links and counts. */
  async detail(sessionId: string, formId: string) {
    const form = await this.audience.loadFormOf(sessionId, formId);
    const answered = await this.answeredQuestionIds(form.questions.map((q) => q.id));
    const responses = await this.prisma.feedbackResponse.count({ where: { formId } });
    const endsAt = this.audience.endsAt(form);

    return {
      id: form.id,
      liveSessionId: form.liveSessionId,
      title: form.title,
      intro: form.intro,
      thankYouText: form.thankYouText,
      dayId: form.dayId,
      dayNumber: dayNumber(form.dayId, form.liveSession.days),
      status: form.status,
      emailMode: form.emailMode,
      emailDelayMinutes: form.emailDelayMinutes,
      allowAnonymous: form.allowAnonymous,
      askConsentToPublish: form.askConsentToPublish,
      askShowName: form.askShowName,
      openLink: form.openLink,
      closesAt: form.closesAt,
      endsAt,
      emailDueAt: emailDueAt(endsAt, form.emailDelayMinutes),
      /** For the Telegram group: asks people to sign in and checks their seat, or, with openLink, takes a typed name. */
      shareUrl: this.invites.shareLinkFor(form.id),
      responses,
      questions: form.questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        label: q.label,
        helpText: q.helpText,
        required: q.required,
        options: q.options,
        answered: answered.has(q.id),
      })),
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    };
  }

  async update(sessionId: string, formId: string, input: FormSettingsInput, actor: Actor) {
    const before = await this.audience.loadFormOf(sessionId, formId);
    if (input.title !== undefined && !input.title.trim()) throw new BadRequestException('A form needs a title.');
    if (input.dayId !== undefined) this.checkDay(input.dayId, before.liveSession.days);

    if (input.status === FeedbackFormStatus.OPEN && before.questions.length === 0) {
      throw new BadRequestException('Add at least one question before opening the form.');
    }
    if (input.status === FeedbackFormStatus.DRAFT && before.status !== FeedbackFormStatus.DRAFT) {
      const replies = await this.prisma.feedbackResponse.count({ where: { formId } });
      if (replies > 0) throw new BadRequestException('This form already has replies. Close it instead of moving it back to draft.');
    }
    const closesAt = input.closesAt === undefined ? undefined : input.closesAt ? new Date(input.closesAt) : null;
    if (closesAt && Number.isNaN(closesAt.getTime())) throw new BadRequestException('closesAt is not a valid date.');

    const form = await this.prisma.feedbackForm.update({
      where: { id: formId },
      data: {
        title: input.title?.trim(),
        intro: blankToNull(input.intro),
        thankYouText: blankToNull(input.thankYouText),
        dayId: input.dayId,
        status: input.status,
        emailMode: input.emailMode,
        emailDelayMinutes: input.emailDelayMinutes,
        allowAnonymous: input.allowAnonymous,
        askConsentToPublish: input.askConsentToPublish,
        askShowName: input.askShowName,
        openLink: input.openLink,
        closesAt,
      },
    });

    // Turning the consent question off means nobody consents from here on;
    // replies already shown with consent stay, they were given it. Turning
    // anonymity off does not unmask anyone: earlier anonymous replies stay so.
    await this.audit.record({
      actorUserId: actor.id,
      action: 'feedback_form.updated',
      entityType: 'feedback_form',
      entityId: formId,
      before: withoutQuestions(before),
      after: form,
      ip: actor.ip,
    });
    return this.detail(sessionId, formId);
  }

  /**
   * Replaces the form's questions with this list, in this order. Questions
   * with an `id` are updated, new ones created, and missing ones removed —
   * deleted if nobody answered them, archived (kept for the results) if
   * someone did.
   */
  async replaceQuestions(sessionId: string, formId: string, drafts: QuestionInput[], actor: Actor) {
    const form = await this.audience.loadFormOf(sessionId, formId);
    if (drafts.length > MAX_QUESTIONS) throw new BadRequestException(`A form can have at most ${MAX_QUESTIONS} questions.`);
    if (drafts.length === 0 && form.status !== FeedbackFormStatus.DRAFT) {
      throw new BadRequestException('An open or closed form needs at least one question.');
    }

    const problems = drafts.flatMap((draft, index) => questionProblems(draft, index + 1));
    const current = new Map(form.questions.map((q) => [q.id, q]));
    const answered = await this.answeredQuestionIds([...current.keys()]);
    const seenIds = new Set<string>();
    for (const draft of drafts) {
      if (!draft.id) continue;
      const existing = current.get(draft.id);
      if (!existing || seenIds.has(draft.id)) {
        problems.push('One of the questions is no longer on this form. Reload the page and try again.');
        continue;
      }
      seenIds.add(draft.id);
      if (existing.kind !== draft.kind && answered.has(draft.id)) {
        problems.push(
          `"${existing.label}" already has answers, so its type cannot change. Add a new question instead and remove this one.`,
        );
      }
    }
    if (problems.length) throw new BadRequestException([...new Set(problems)].join(' '));

    const removed = form.questions.filter((q) => !seenIds.has(q.id));
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const question of removed) {
        if (answered.has(question.id)) {
          await tx.feedbackQuestion.update({ where: { id: question.id }, data: { archivedAt: now } });
        } else {
          await tx.feedbackQuestion.delete({ where: { id: question.id } });
        }
      }
      for (const [sortOrder, draft] of drafts.entries()) {
        const data = {
          kind: draft.kind,
          label: draft.label.trim(),
          helpText: blankToNull(draft.helpText) ?? null,
          required: draft.required ?? false,
          options: cleanOptions(draft),
          sortOrder,
        };
        if (draft.id) await tx.feedbackQuestion.update({ where: { id: draft.id }, data });
        else await tx.feedbackQuestion.create({ data: { ...data, formId } });
      }
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: 'feedback_form.questions_replaced',
      entityType: 'feedback_form',
      entityId: formId,
      before: form.questions,
      after: { questions: drafts, archived: removed.filter((q) => answered.has(q.id)).map((q) => q.id) },
      ip: actor.ip,
    });
    return this.detail(sessionId, formId);
  }

  /** Deletes a form nobody has replied to. One with replies is closed instead. */
  async remove(sessionId: string, formId: string, actor: Actor) {
    const form = await this.audience.loadFormOf(sessionId, formId);
    const replies = await this.prisma.feedbackResponse.count({ where: { formId } });
    if (replies > 0) {
      throw new BadRequestException(`This form has ${replies} repl${replies === 1 ? 'y' : 'ies'}. Close it instead; deleting would lose them.`);
    }
    await this.prisma.feedbackForm.delete({ where: { id: formId } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'feedback_form.deleted',
      entityType: 'feedback_form',
      entityId: formId,
      before: form,
      ip: actor.ip,
    });
  }

  /**
   * The results: numbers per question, and every reply. An anonymous reply
   * comes without a name or email, here and in any export built from this.
   */
  async results(sessionId: string, formId: string) {
    const form = await this.audience.loadFormOf(sessionId, formId);
    const questions = await this.prisma.feedbackQuestion.findMany({
      where: { formId, OR: [{ archivedAt: null }, { answers: { some: {} } }] },
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
    });
    const responses = await this.prisma.feedbackResponse.findMany({
      where: { formId },
      orderBy: { submittedAt: 'desc' },
      include: {
        answers: true,
        highlights: { select: { id: true, sectionId: true, quote: true, attribution: true, rating: true } },
        user: { select: { name: true, email: true } },
      },
    });
    const stages = await this.stagesOf(
      form.liveSessionId,
      responses.flatMap((r) => (r.userId ? [r.userId] : [])),
    );

    return {
      formId,
      total: responses.length,
      questions: questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        label: q.label,
        options: q.options,
        archived: q.archivedAt !== null,
      })),
      summary: summarise(questions, responses.flatMap((r) => r.answers)),
      responses: responses.map((r) => ({
        id: r.id,
        isAnonymous: r.isAnonymous,
        name: r.isAnonymous ? null : (r.user?.name ?? r.respondentName),
        email: r.isAnonymous ? null : (r.user?.email ?? null),
        /** "Final year", from their registration. Hidden with the name. */
        stage: r.isAnonymous || !r.userId ? null : (stages.get(r.userId) ?? null),
        /** False for an open-link reply: the name was typed, and nothing checked a seat. */
        verified: r.userId !== null,
        consentToPublish: r.consentToPublish,
        /** Null when the form did not ask. */
        showName: r.isAnonymous ? false : r.showName,
        source: r.source,
        submittedAt: r.submittedAt,
        editedAt: r.editedAt,
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          rating: a.ratingValue,
          text: a.textValue,
          choices: a.choiceValues,
        })),
        highlights: r.highlights,
      })),
    };
  }

  /** Removes one reply (spam, a test). Its highlights go with it. */
  async removeResponse(sessionId: string, formId: string, responseId: string, actor: Actor) {
    await this.audience.loadFormOf(sessionId, formId);
    const response = await this.prisma.feedbackResponse.findFirst({
      where: { id: responseId, formId },
      include: { answers: true },
    });
    if (!response) throw new NotFoundException('That reply is not on this form.');
    await this.prisma.feedbackResponse.delete({ where: { id: responseId } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'feedback_response.deleted',
      entityType: 'feedback_response',
      entityId: responseId,
      before: response,
      ip: actor.ip,
    });
  }

  // --- internals ----------------------------------------------------------------

  private async answeredQuestionIds(questionIds: string[]): Promise<Set<string>> {
    if (questionIds.length === 0) return new Set();
    const rows = await this.prisma.feedbackAnswer.findMany({
      where: { questionId: { in: questionIds } },
      distinct: ['questionId'],
      select: { questionId: true },
    });
    return new Set(rows.map((r) => r.questionId));
  }

  private async stagesOf(sessionId: string, userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.sessionRegistration.findMany({
      where: { liveSessionId: sessionId, userId: { in: userIds } },
      select: { userId: true, stage: true },
    });
    return new Map(rows.map((r) => [r.userId, r.stage]));
  }

  private async sessionOrThrow(sessionId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { productId: sessionId },
      select: { productId: true, days: { orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true, durationMinutes: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private checkDay(dayId: string | null | undefined, days: Array<{ id: string }>) {
    if (dayId && !days.some((d) => d.id === dayId)) throw new BadRequestException('That day is not part of this session.');
  }
}

function dayNumber(dayId: string | null, days: Array<{ id: string }>): number | null {
  const index = dayId ? days.findIndex((d) => d.id === dayId) : -1;
  return index >= 0 ? index + 1 : null;
}

function withoutQuestions(form: LoadedForm): Omit<LoadedForm, 'questions' | 'liveSession'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { questions, liveSession, ...rest } = form;
  return rest;
}
