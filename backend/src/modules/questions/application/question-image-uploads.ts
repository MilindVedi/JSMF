import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StorageService } from '../../storage/application/storage.service';
import type { ObjectRef } from '../../storage/domain/storage-provider.port';
import { UploadPurposeRegistry } from '../../uploads/application/upload-purpose';
import {
  QUESTION_IMAGE_COLUMNS_SELECT,
  QUESTION_IMAGE_FIELDS,
  QuestionImageField,
  QuestionImageLinks,
  questionImageFileData,
  questionImageRefOf,
} from './question-image-links';

const MB = 1024 * 1024;

/** The image types a question image may be. Each needs a signature in uploads' domain/file-signature.ts. */
export const QUESTION_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Where a question's images live, under the private bucket. */
export const questionImageKeyPrefix = (questionId: string) => `pyq/questions/${questionId}`;

/** A question's uploaded images, as the admin editor shows them: a short-lived preview link each, or null. */
export interface QuestionImageUploadsView {
  stemImageUpload: { url: string } | null;
  explanationImageUpload: { url: string } | null;
}

/** What `context` carries between `record` and `committed`. */
interface ImageUploadContext {
  field: QuestionImageField;
  replaced?: ObjectRef | null;
}

/**
 * "pyq.question_image": an X-ray, photo or diagram shown with a question —
 * under the question (`stem`) or with its explanation (`explanation`).
 *
 * PRIVATE: the file goes straight to the private bucket and is checked there.
 * Accepting it writes its address to the question's `stemImage*` /
 * `explanationImage*` columns; students only ever get a short-lived signed
 * link to it, made when the API sends them the question (QuestionImageLinks).
 * Question images are part of what students pay for, so — like the PDFs and
 * unlike covers — nobody outside the app can open, list or keep a link to them.
 *
 * Uploading clears the field's pasted link, so removing the file later never
 * brings back an old link nobody remembers. The file it replaces is deleted
 * once the new one is saved, as is a removed one: a student holding a link to
 * it at that moment loses the old image, which is the point of replacing it.
 */
@Injectable()
export class QuestionImageUploads implements OnModuleInit {
  private readonly logger = new Logger(QuestionImageUploads.name);

  constructor(
    private readonly registry: UploadPurposeRegistry,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
    private readonly links: QuestionImageLinks,
  ) {}

  onModuleInit(): void {
    this.registry.register<{ field: QuestionImageField }, { questionId: string } & QuestionImageUploadsView>({
      key: 'pyq.question_image',
      // The same as the admin question routes.
      roles: ['ADMIN'],
      visibility: 'PRIVATE',
      mimeTypes: QUESTION_IMAGE_MIME_TYPES,
      maxBytes: () => this.config.get('MAX_IMAGE_UPLOAD_SIZE_MB') * MB,

      // Only `field` is read. Anything else is ignored rather than refused —
      // `record` adds `replaced`, and a completion may re-parse that — and is
      // never trusted: `committed` reads the `replaced` that `record` wrote.
      parseContext(raw) {
        const field = ((raw ?? {}) as Record<string, unknown>).field ?? 'stem';
        if (!QUESTION_IMAGE_FIELDS.includes(field as QuestionImageField)) {
          throw new BadRequestException('field must be "stem" or "explanation".');
        }
        return { field: field as QuestionImageField };
      },

      prepare: async ({ targetId }) => {
        if (!targetId) throw new BadRequestException('Say which question the image is for (targetId).');
        const question = await this.prisma.question.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        });
        if (!question) throw new NotFoundException('Question not found');
        return { keyPrefix: questionImageKeyPrefix(targetId) };
      },

      record: async (tx, { upload, context, ref, actor }) => {
        const questionId = upload.targetId!;
        const previous = await tx.question.findUniqueOrThrow({
          where: { id: questionId },
          select: QUESTION_IMAGE_COLUMNS_SELECT,
        });
        await tx.question.update({
          where: { id: questionId },
          data: {
            ...questionImageFileData(context.field, ref),
            ...(context.field === 'stem' ? { stemImageUrl: null } : { explanationImageUrl: null }),
          },
        });
        // Deleting the old file is storage work, which must not happen inside
        // this transaction; the upload's own row carries it to `committed`.
        const replaced = questionImageRefOf(previous, context.field);
        await tx.upload.update({
          where: { id: upload.id },
          data: { context: { field: context.field, replaced } as unknown as Prisma.InputJsonValue },
        });
        activity(this.logger, 'pyq.question_image_set', { actorId: actor.id, questionId, field: context.field });
        return { id: questionId };
      },

      committed: async ({ upload }) => {
        // Re-read: the row handed in here is the one from before `record`.
        const row = await this.prisma.upload.findUnique({ where: { id: upload.id }, select: { context: true } });
        const replaced = (row?.context as ImageUploadContext | null)?.replaced;
        // A failure only leaves one superseded image in the bucket; it must
        // never undo an image the admin has already been told is saved.
        if (replaced) await this.deleteFile(replaced, 'replaced');
      },

      present: async (questionId) => ({ questionId, ...(await this.uploadsOf(questionId)) }),
    });
  }

  /** A question's uploaded images with preview links, for the admin editor. */
  async uploadsOf(questionId: string): Promise<QuestionImageUploadsView> {
    const row = await this.prisma.question.findUniqueOrThrow({
      where: { id: questionId },
      select: QUESTION_IMAGE_COLUMNS_SELECT,
    });
    return this.viewOf(row);
  }

  async viewOf(row: Parameters<typeof questionImageRefOf>[0]): Promise<QuestionImageUploadsView> {
    const preview = async (field: QuestionImageField) =>
      questionImageRefOf(row, field) ? { url: (await this.links.linkFor(row, field)) ?? '' } : null;
    const [stemImageUpload, explanationImageUpload] = await Promise.all([preview('stem'), preview('explanation')]);
    return { stemImageUpload, explanationImageUpload };
  }

  /** Removes a question's uploaded image: forgets it, then deletes its file. Safe to call with none set. */
  async remove(questionId: string, field: QuestionImageField, actorId: string): Promise<void> {
    const row = await this.prisma.question.findFirst({
      where: { id: questionId, deletedAt: null },
      select: QUESTION_IMAGE_COLUMNS_SELECT,
    });
    if (!row) throw new NotFoundException('Question not found');
    const ref = questionImageRefOf(row, field);
    if (!ref) return;
    // The columns are cleared first: an image the admin removed must not
    // still be shown because deleting its file failed.
    await this.prisma.question.update({ where: { id: questionId }, data: questionImageFileData(field, null) });
    activity(this.logger, 'pyq.question_image_removed', { actorId, questionId, field });
    await this.deleteFile(ref, 'removed');
  }

  private async deleteFile(ref: ObjectRef, why: 'replaced' | 'removed'): Promise<void> {
    await this.storage.delete(ref).catch((error: unknown) => {
      this.logger.warn(`Could not delete a ${why} question image (${ref.bucket}/${ref.objectKey}): ${String(error)}`);
    });
  }
}
