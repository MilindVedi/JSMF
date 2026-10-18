import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf } from '../../storage/domain/storage-provider.port';

export interface TestimonialSectionInput {
  heading?: string;
  subheading?: string | null;
  tag?: string | null;
  /** A day of this session, or null for none. */
  dayId?: string | null;
  isVisible?: boolean;
}

/** "" from a cleared form field means "remove it", the same as null. */
const blankToNull = (value: string | null | undefined) => (value === '' ? null : value);

/**
 * Named testimonial galleries on a session's pages — "What students said
 * after Day 1", and whatever comes next — beside the original one.
 *
 * Only the sections themselves live here: their copy, order, visibility and
 * removal. Their images are added, ordered and removed through the existing
 * testimonial methods on LiveSessionService, which take a section id, so
 * there is one upload path for every gallery.
 */
@Injectable()
export class SessionTestimonialSectionsService {
  private readonly logger = new Logger(SessionTestimonialSectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async create(sessionId: string, input: TestimonialSectionInput, actor: { id: string; ip?: string | null }) {
    const heading = input.heading?.trim();
    if (!heading) throw new BadRequestException('A section needs a heading.');
    await this.sessionOrThrow(sessionId);
    await this.checkDay(sessionId, input.dayId);

    const last = await this.prisma.sessionTestimonialSection.findFirst({
      where: { liveSessionId: sessionId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const section = await this.prisma.sessionTestimonialSection.create({
      data: {
        liveSessionId: sessionId,
        heading,
        subheading: blankToNull(input.subheading) ?? null,
        tag: blankToNull(input.tag) ?? null,
        dayId: input.dayId ?? null,
        isVisible: input.isVisible ?? true,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'session_testimonial_section.created',
      entityType: 'session_testimonial_section',
      entityId: section.id,
      after: section,
      ip: actor.ip,
    });
    return section;
  }

  async update(
    sessionId: string,
    sectionId: string,
    input: TestimonialSectionInput,
    actor: { id: string; ip?: string | null },
  ) {
    const before = await this.sectionOrThrow(sessionId, sectionId);
    if (input.heading !== undefined && !input.heading.trim()) {
      throw new BadRequestException('A section needs a heading.');
    }
    await this.checkDay(sessionId, input.dayId);

    const section = await this.prisma.sessionTestimonialSection.update({
      where: { id: sectionId },
      data: {
        heading: input.heading?.trim(),
        subheading: blankToNull(input.subheading),
        tag: blankToNull(input.tag),
        dayId: input.dayId,
        isVisible: input.isVisible,
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'session_testimonial_section.updated',
      entityType: 'session_testimonial_section',
      entityId: sectionId,
      before,
      after: section,
      ip: actor.ip,
    });
    return section;
  }

  /**
   * Deletes a section and its images, stored files included — the same rule
   * as removing a single testimonial: taken off the page means gone, not
   * merely unlinked. Hiding it (isVisible) is the way to keep it.
   */
  async remove(sessionId: string, sectionId: string, actor: { id: string; ip?: string | null }) {
    const section = await this.sectionOrThrow(sessionId, sectionId);
    const images = await this.prisma.sessionTestimonial.findMany({ where: { sectionId } });

    await this.prisma.$transaction([
      this.prisma.sessionTestimonial.deleteMany({ where: { sectionId } }),
      this.prisma.sessionTestimonialSection.delete({ where: { id: sectionId } }),
    ]);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'session_testimonial_section.deleted',
      entityType: 'session_testimonial_section',
      entityId: sectionId,
      before: { ...section, images: images.length },
      ip: actor.ip,
    });

    for (const image of images) {
      try {
        await this.storage.delete(objectRefOf(image));
      } catch (cause) {
        // The rows are gone, so the page is right. An orphaned file is a
        // storage-cleanup problem, not a reason to fail the admin's action.
        this.logger.warn(
          `Could not delete stored image ${image.objectKey}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
  }

  /** Sets the sections' order. Must name exactly this session's sections, once each. */
  async reorder(sessionId: string, sectionIds: string[]) {
    const rows = await this.prisma.sessionTestimonialSection.findMany({
      where: { liveSessionId: sessionId },
      select: { id: true },
    });
    const current = new Set(rows.map((r) => r.id));
    const next = new Set(sectionIds);
    if (sectionIds.length !== rows.length || next.size !== current.size || [...next].some((id) => !current.has(id))) {
      throw new BadRequestException("sectionIds must list exactly this session's sections, once each.");
    }
    await this.prisma.$transaction(
      sectionIds.map((id, sortOrder) =>
        this.prisma.sessionTestimonialSection.update({ where: { id }, data: { sortOrder } }),
      ),
    );
  }

  private async sessionOrThrow(sessionId: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { productId: sessionId }, select: { productId: true } });
    if (!session) throw new NotFoundException('Session not found');
  }

  private async sectionOrThrow(sessionId: string, sectionId: string) {
    const section = await this.prisma.sessionTestimonialSection.findFirst({
      where: { id: sectionId, liveSessionId: sessionId },
    });
    if (!section) throw new NotFoundException('That section is not on this session.');
    return section;
  }

  private async checkDay(sessionId: string, dayId: string | null | undefined) {
    if (!dayId) return;
    const day = await this.prisma.liveSessionDay.findFirst({ where: { id: dayId, liveSessionId: sessionId } });
    if (!day) throw new BadRequestException('That day is not part of this session.');
  }
}
