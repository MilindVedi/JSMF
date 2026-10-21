import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf, type ObjectRef } from '../../storage/domain/storage-provider.port';
import { UploadPurposeRegistry } from '../../uploads/application/upload-purpose';

const MB = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The image types a testimonial screenshot may be. */
export const TESTIMONIAL_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Where a session's screenshots are stored, under the public bucket. */
export const testimonialKeyPrefix = (sessionId: string) => `sessions/${sessionId}/testimonials`;

/**
 * Adds a screenshot row at the end of its gallery. Shared by the multipart
 * route (LiveSessionService.addTestimonial) and direct uploads, so both
 * record a screenshot the same way.
 */
export async function insertTestimonial(
  db: Prisma.TransactionClient,
  input: {
    sessionId: string;
    sectionId: string | null;
    ref: ObjectRef;
    mimeType: string;
    sizeBytes: number;
    uploadedById: string;
  },
) {
  const last = await db.sessionTestimonial.findFirst({
    where: { liveSessionId: input.sessionId, sectionId: input.sectionId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return db.sessionTestimonial.create({
    data: {
      liveSessionId: input.sessionId,
      storageProvider: input.ref.provider,
      bucket: input.ref.bucket,
      objectKey: input.ref.objectKey,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      sortOrder: (last?.sortOrder ?? -1) + 1,
      uploadedById: input.uploadedById,
      sectionId: input.sectionId,
    },
  });
}

/**
 * "session.testimonial": a screenshot for a session's page, uploaded straight
 * to storage. Public, so it is checked in private staging first and copied to
 * the public bucket only once accepted.
 */
@Injectable()
export class SessionTestimonialUploads implements OnModuleInit {
  constructor(
    private readonly registry: UploadPurposeRegistry,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.registry.register<{ sectionId: string | null }, { id: string; url: string; sortOrder: number }>({
      key: 'session.testimonial',
      // The same as the admin session routes.
      roles: ['ADMIN', 'EDUCATOR'],
      visibility: 'PUBLIC',
      mimeTypes: TESTIMONIAL_MIME_TYPES,
      maxBytes: () => this.config.get('MAX_IMAGE_UPLOAD_SIZE_MB') * MB,

      parseContext(raw) {
        const sectionId = ((raw ?? {}) as Record<string, unknown>).sectionId;
        if (sectionId === undefined || sectionId === null) return { sectionId: null };
        if (typeof sectionId !== 'string' || !UUID.test(sectionId)) {
          throw new BadRequestException('sectionId must be a section id.');
        }
        return { sectionId };
      },

      prepare: async ({ targetId, context }) => {
        if (!targetId) throw new BadRequestException('Say which session the screenshot is for (targetId).');
        const session = await this.prisma.liveSession.findFirst({
          where: { productId: targetId, product: { deletedAt: null } },
          select: { productId: true },
        });
        if (!session) throw new NotFoundException('Session not found');
        if (context.sectionId) {
          const section = await this.prisma.sessionTestimonialSection.findFirst({
            where: { id: context.sectionId, liveSessionId: targetId },
            select: { id: true },
          });
          if (!section) throw new NotFoundException('That section is not on this session.');
        }
        return { keyPrefix: testimonialKeyPrefix(targetId) };
      },

      record: (tx, { upload, context, ref, info, actor }) =>
        insertTestimonial(tx, {
          sessionId: upload.targetId!,
          sectionId: context.sectionId,
          ref,
          mimeType: upload.mimeType,
          sizeBytes: info.sizeBytes,
          uploadedById: actor.id,
        }),

      present: async (resultId) => {
        const row = await this.prisma.sessionTestimonial.findUniqueOrThrow({ where: { id: resultId } });
        return {
          id: row.id,
          url: await this.storage.getSignedDownloadUrl(objectRefOf(row), { disposition: 'inline' }),
          sortOrder: row.sortOrder,
        };
      },
    });
  }
}
