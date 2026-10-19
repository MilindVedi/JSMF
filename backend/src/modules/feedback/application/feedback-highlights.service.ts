import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { FeedbackQuestionKind, Prisma } from '@prisma/client';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  SessionShowcase,
  type SectionQuote,
  type SectionQuoteSource,
} from '../../events/application/session-showcase';
import { ANONYMOUS_ATTRIBUTION, nameMayBeShown } from '../domain/feedback-rules';
import { FeedbackAudience } from './feedback-audience';

type Actor = { id: string; ip?: string | null };

export interface HighlightInput {
  responseId: string;
  sectionId: string;
  /** Defaults to the reply's longest written answer. */
  quote?: string;
  /** Defaults to "First name · Stage", or "A JSMF student" for an anonymous reply. */
  attribution?: string;
  /** Defaults to the reply's first star rating. Null shows no stars. */
  rating?: number | null;
  /**
   * Show the student's name. The admin's call; defaults to what the student
   * chose (shown when they were not asked). Never for an anonymous reply.
   */
  showName?: boolean;
}

const QUOTE_MAX = 1000;
const ATTRIBUTION_MAX = 120;

/**
 * Replies picked to show on the website, as quote cards in one of the
 * session's feedback sections, beside its screenshots.
 *
 * Two rules hold here: where the form asked "Can we show this on our
 * website?", only a reply that said yes can be picked; and a reply whose
 * author hid their name, or said no to showing it, is shown as "A JSMF
 * student". Changing either answer later updates the card (see
 * FeedbackResponsesService.submit).
 *
 * Registered with the events module's SessionShowcase, which is how the
 * public session page gets the quotes without knowing this module exists.
 */
@Injectable()
export class FeedbackHighlightsService implements SectionQuoteSource, OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: FeedbackAudience,
    private readonly showcase: SessionShowcase,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.showcase.register(this);
  }

  async quotesFor(sectionIds: string[]): Promise<Map<string, SectionQuote[]>> {
    const rows = await this.prisma.feedbackHighlight.findMany({
      // The consent rule again at read time, for a form that asks for it:
      // belt and braces for the one thing that must never be wrong on a
      // public page. A form that does not ask leaves the choice to the team.
      where: {
        sectionId: { in: sectionIds },
        response: { OR: [{ consentToPublish: true }, { form: { askConsentToPublish: false } }] },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, sectionId: true, quote: true, attribution: true, rating: true },
    });
    const bySection = new Map<string, SectionQuote[]>();
    for (const row of rows) {
      const list = bySection.get(row.sectionId) ?? [];
      list.push({ id: row.id, quote: row.quote, attribution: row.attribution, rating: row.rating });
      bySection.set(row.sectionId, list);
    }
    return bySection;
  }

  async create(sessionId: string, formId: string, input: HighlightInput, actor: Actor) {
    const form = await this.audience.loadFormOf(sessionId, formId);
    const response = await this.prisma.feedbackResponse.findFirst({
      where: { id: input.responseId, formId },
      include: {
        answers: { include: { question: { select: { kind: true, sortOrder: true } } } },
        user: { select: { name: true } },
      },
    });
    if (!response) throw new NotFoundException('That reply is not on this form.');
    if (form.askConsentToPublish && !response.consentToPublish) {
      throw new BadRequestException('This student did not agree to their reply being shown on the website.');
    }
    const section = await this.prisma.sessionTestimonialSection.findFirst({
      where: { id: input.sectionId, liveSessionId: sessionId },
      select: { id: true },
    });
    if (!section) throw new BadRequestException('That feedback section is not on this session.');

    const answers = [...response.answers].sort((a, b) => a.question.sortOrder - b.question.sortOrder);
    const written = answers
      .map((a) => a.textValue)
      .filter((t): t is string => Boolean(t))
      .sort((a, b) => b.length - a.length);
    const quote = (input.quote ?? written[0] ?? '').trim();
    if (!quote) throw new BadRequestException('This reply has no written answer to quote. Type the quote to show.');
    if (quote.length > QUOTE_MAX) throw new BadRequestException(`A quote can be at most ${QUOTE_MAX} characters.`);

    const withName = !response.isAnonymous && (input.showName ?? nameMayBeShown(response));
    const attribution = !withName
      ? ANONYMOUS_ATTRIBUTION
      : input.attribution?.trim() ||
        (await this.defaultAttribution(sessionId, response.userId, response.user?.name ?? response.respondentName ?? ''));
    const rating =
      input.rating !== undefined
        ? input.rating
        : (answers.find((a) => a.question.kind === FeedbackQuestionKind.RATING)?.ratingValue ?? null);
    this.checkRating(rating);

    const last = await this.prisma.feedbackHighlight.findFirst({
      where: { sectionId: section.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    try {
      const highlight = await this.prisma.feedbackHighlight.create({
        data: {
          responseId: response.id,
          sectionId: section.id,
          quote,
          attribution: attribution.slice(0, ATTRIBUTION_MAX),
          rating,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          createdById: actor.id,
        },
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'feedback_highlight.created',
        entityType: 'feedback_highlight',
        entityId: highlight.id,
        after: highlight,
        ip: actor.ip,
      });
      return highlight;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This reply is already shown in that section.');
      }
      throw error;
    }
  }

  /** Tidies a card's text, name or stars. An anonymous reply's name stays hidden. */
  async update(
    sessionId: string,
    formId: string,
    highlightId: string,
    input: Pick<HighlightInput, 'quote' | 'attribution' | 'rating'>,
    actor: Actor,
  ) {
    const before = await this.highlightOrThrow(sessionId, formId, highlightId);
    const quote = input.quote?.trim();
    if (quote !== undefined && !quote) throw new BadRequestException('A quote cannot be empty.');
    if (quote && quote.length > QUOTE_MAX) throw new BadRequestException(`A quote can be at most ${QUOTE_MAX} characters.`);
    if (input.rating !== undefined) this.checkRating(input.rating);
    const attribution = before.response.isAnonymous ? undefined : input.attribution?.trim().slice(0, ATTRIBUTION_MAX) || undefined;

    const highlight = await this.prisma.feedbackHighlight.update({
      where: { id: highlightId },
      data: { quote, attribution, rating: input.rating },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'feedback_highlight.updated',
      entityType: 'feedback_highlight',
      entityId: highlightId,
      before,
      after: highlight,
      ip: actor.ip,
    });
    return highlight;
  }

  async remove(sessionId: string, formId: string, highlightId: string, actor: Actor) {
    const before = await this.highlightOrThrow(sessionId, formId, highlightId);
    await this.prisma.feedbackHighlight.delete({ where: { id: highlightId } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'feedback_highlight.deleted',
      entityType: 'feedback_highlight',
      entityId: highlightId,
      before,
      ip: actor.ip,
    });
  }

  // --- internals ----------------------------------------------------------------

  private async highlightOrThrow(sessionId: string, formId: string, highlightId: string) {
    await this.audience.loadFormOf(sessionId, formId);
    const highlight = await this.prisma.feedbackHighlight.findFirst({
      where: { id: highlightId, response: { formId } },
      include: { response: { select: { isAnonymous: true, showName: true } } },
    });
    if (!highlight) throw new NotFoundException('That highlight is not on this form.');
    return highlight;
  }

  /**
   * "Riya · Final year": first name, and their stage from registration when
   * known. An open-link reply has no registration, so it is the typed first name.
   */
  private async defaultAttribution(sessionId: string, userId: string | null, name: string): Promise<string> {
    const first = name.trim().split(/\s+/)[0] || ANONYMOUS_ATTRIBUTION;
    if (!userId) return first;
    const registration = await this.prisma.sessionRegistration.findUnique({
      where: { liveSessionId_userId: { liveSessionId: sessionId, userId } },
      select: { stage: true },
    });
    return registration?.stage ? `${first} · ${registration.stage}` : first;
  }

  private checkRating(rating: number | null) {
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      throw new BadRequestException('Stars must be a whole number from 1 to 5, or none.');
    }
  }
}
