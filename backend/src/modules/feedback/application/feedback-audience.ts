import { Injectable, NotFoundException } from '@nestjs/common';
import { EntitlementStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { formEndsAt, isEligible } from '../domain/feedback-rules';

/** A seat holder this form asks. */
export interface Respondent {
  userId: string;
  name: string;
  email: string | null;
  /** When they got their seat. */
  joinedAt: Date;
}

const FORM_INCLUDE = {
  liveSession: {
    select: {
      productId: true,
      shortName: true,
      showNotSpamNotice: true,
      product: { select: { title: true } },
      days: { orderBy: { startsAt: 'asc' as const }, select: { id: true, startsAt: true, durationMinutes: true } },
    },
  },
  questions: {
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

export type LoadedForm = NonNullable<Awaited<ReturnType<FeedbackAudience['loadForm']>>>;

/**
 * Who a feedback form is for, and what every part of the module needs to know
 * about it. The one place that reads the live session tables: seat holders are
 * people with an ACTIVE entitlement to the session (the platform's one answer
 * to "has a seat"), and a form's day decides who was there for it.
 */
@Injectable()
export class FeedbackAudience {
  constructor(private readonly prisma: PrismaService) {}

  /** The form with its session's title and days, and its current (not archived) questions. */
  async loadForm(formId: string) {
    return this.prisma.feedbackForm.findUnique({ where: { id: formId }, include: FORM_INCLUDE });
  }

  /** The same, refusing a form that is not on this session. */
  async loadFormOf(sessionId: string, formId: string): Promise<LoadedForm> {
    const form = await this.loadForm(formId);
    if (!form || form.liveSessionId !== sessionId) throw new NotFoundException('That feedback form is not on this session.');
    return form;
  }

  endsAt(form: LoadedForm): Date | null {
    return formEndsAt(form.dayId, form.liveSession.days);
  }

  /** "Day 2" for a day of a multi-day session; null for a one-day session or a whole-session form. */
  dayLabel(form: Pick<LoadedForm, 'dayId' | 'liveSession'>): string | null {
    const { days } = form.liveSession;
    if (!form.dayId || days.length < 2) return null;
    const index = days.findIndex((d) => d.id === form.dayId);
    return index >= 0 ? `Day ${index + 1}` : null;
  }

  /** Everyone the form asks, oldest seat first. */
  async respondents(form: LoadedForm): Promise<Respondent[]> {
    const endsAt = this.endsAt(form);
    const seats = await this.prisma.entitlement.findMany({
      where: { productId: form.liveSessionId, status: EntitlementStatus.ACTIVE },
      orderBy: { grantedAt: 'asc' },
      select: { userId: true, grantedAt: true, user: { select: { name: true, email: true } } },
    });
    // One person can hold the seat twice (bought, then also added by hand):
    // the earliest seat counts.
    const seen = new Set<string>();
    return seats
      .filter((seat) => isEligible(seat.grantedAt, endsAt))
      .filter((seat) => !seen.has(seat.userId) && seen.add(seat.userId))
      .map((seat) => ({ userId: seat.userId, name: seat.user.name, email: seat.user.email, joinedAt: seat.grantedAt }));
  }

  /** Whether this one person is asked. */
  async isRespondent(form: LoadedForm, userId: string): Promise<boolean> {
    const seat = await this.prisma.entitlement.findFirst({
      where: { productId: form.liveSessionId, userId, status: EntitlementStatus.ACTIVE },
      orderBy: { grantedAt: 'asc' },
      select: { grantedAt: true },
    });
    return seat !== null && isEligible(seat.grantedAt, this.endsAt(form));
  }
}
