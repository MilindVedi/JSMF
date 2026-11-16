import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UploadStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { StorageService } from '../../storage/application/storage.service';
import type { ObjectRef } from '../../storage/domain/storage-provider.port';
import { UploadPurposeRegistry } from '../../uploads/application/upload-purpose';
import {
  type ImportExam,
  type ImportSubject,
  type ImportTopic,
  type QuestionExtraColumns,
  QuestionImportService,
} from './question-import.service';
import {
  QUESTION_IMAGE_FIELDS,
  type QuestionImageField,
  questionImageFileData,
  questionImageRefOf,
} from './question-image-links';
import { QUESTION_IMAGE_MIME_TYPES, questionImageKeyPrefix } from './question-image-uploads';
import {
  classify,
  hashQuestion,
  imageExtension,
  MD5_HEX,
  RELEASE_IMAGE_KEY_PREFIX,
  RELEASE_IMAGE_PURPOSE,
  RELEASE_ROW_SELECT,
  type ReleaseClassification,
  type ReleaseImageIds,
  imageIdsOf,
  type ReleaseQuestion,
  type ReleaseQuestionInput,
  releaseQuestionOf,
  SHA256_HEX,
  stateHash,
  toImportQuestion,
  uuidv7,
  writes,
} from './question-release';

const MB = 1024 * 1024;
const HOUR_MS = 3600_000;
/**
 * A staged image this close to the sweep's cut-off counts as not uploaded, so
 * the sweep can never delete one between a preview and the apply that uses it.
 */
const STAGED_SAFETY_MS = 2 * HOUR_MS;
/** Staged images deleted per sweep run — a bound on one tick's storage calls. */
const SWEEP_BATCH = 200;

export interface ReleasePreviewInput {
  name: string;
  exams: string[];
  subjects: string[];
  topics: { slug: string; subjectSlug: string }[];
  questions: { externalKey: string; contentHash: string; images: Partial<ReleaseImageIds> }[];
}

export interface ReleasePreviewQuestion extends ReleaseClassification {
  externalKey: string;
  /** Published here: a CHANGED or overwritten question changes what students see at once. */
  published: boolean;
}

export interface ReleasePreview {
  questions: ReleasePreviewQuestion[];
  /** Exams, subjects and topics the push will create — never ones it changes. */
  create: { exams: string[]; subjects: string[]; topics: string[] };
  /** Images (SHA-256) the push needs that are not uploaded yet. */
  missingImages: string[];
  /** Topics that exist here under a different subject: their questions cannot be pushed. */
  problems: string[];
}

export interface ReleaseApplyInput {
  name: string;
  exams: ImportExam[];
  subjects: ImportSubject[];
  topics: ImportTopic[];
  questions: ReleaseQuestionInput[];
  /** Keys of CONFLICT questions the admin chose to overwrite. */
  overwrite: string[];
}

export type ReleaseOutcome = 'CREATED' | 'UPDATED' | 'OVERWRITTEN' | 'UNCHANGED' | 'SKIPPED' | 'FAILED';

export interface ReleaseApplyResult {
  questions: { externalKey: string; outcome: ReleaseOutcome; reason?: string }[];
}

/** An image uploaded for a push, found again by its content. */
interface StagedImage {
  ref: ObjectRef;
  /** As checked by the upload (declared, size- and signature-checked). */
  mimeType: string;
}

/** A question's push that must not happen after all; nothing of it is kept. */
class ReleaseSkip extends Error {}

/**
 * Pushes content releases (question-release.ts) into this environment, in
 * three steps the admin page drives:
 *
 * 1. `preview` — what each question would do (NEW / CHANGED / UNCHANGED /
 *    CONFLICT / DELETED), which exams/subjects/topics would be created, and
 *    which images are not uploaded yet. Writes nothing.
 * 2. Images go straight from the browser to the private bucket's release
 *    staging area through the normal upload flow ("pyq.release_image": admin
 *    only, type-sniffed, size-capped, and refused unless its MD5 is the one
 *    the release recorded — the bytes are exactly the exported ones). They
 *    never pass through this server, and are found again by content, so a
 *    re-run uploads nothing twice.
 * 3. `apply` — per question, all or nothing: its images are copied inside
 *    storage to `pyq/questions/<id>/`, then one transaction (holding the row
 *    lock) checks the verdict again, writes the content, options, images and
 *    release hashes. Whatever a question replaced is deleted after commit;
 *    whatever a failed question copied is deleted at once.
 *
 * Sent in chunks small enough for the API's 100 KB request limit; each chunk
 * is safe to repeat.
 */
@Injectable()
export class QuestionReleaseService implements OnModuleInit {
  private readonly logger = new Logger(QuestionReleaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly registry: UploadPurposeRegistry,
    private readonly importer: QuestionImportService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly sweeps: SweepRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register<{ sha256: string; md5: string }, { uploadId: string }>({
      key: RELEASE_IMAGE_PURPOSE,
      roles: ['ADMIN'],
      visibility: 'PRIVATE',
      mimeTypes: QUESTION_IMAGE_MIME_TYPES,
      maxBytes: () => this.config.get('MAX_IMAGE_UPLOAD_SIZE_MB') * MB,
      parseContext(raw) {
        const { sha256, md5 } = (raw ?? {}) as Record<string, unknown>;
        if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256) || typeof md5 !== 'string' || !MD5_HEX.test(md5)) {
          throw new BadRequestException('A release image needs its sha256 and md5 (lowercase hex) from the release file.');
        }
        return { sha256, md5 };
      },
      prepare: async ({ targetId }) => {
        if (targetId) throw new BadRequestException('A release image belongs to no question yet; send no targetId.');
        return { keyPrefix: RELEASE_IMAGE_KEY_PREFIX };
      },
      // The integrity check: the bytes that arrived are the ones exported.
      inspect: async ({ context, info }) =>
        info.md5 === context.md5
          ? null
          : {
              message: info.md5
                ? 'This image is not the one in the release (its checksum differs). Choose the release file again.'
                : 'Storage gave no checksum for this image, so it cannot be checked against the release.',
            },
      record: async (_tx, { upload }) => ({ id: upload.id }),
      present: async (uploadId) => ({ uploadId }),
    });
    this.sweeps.register({ name: 'pyq-release-images', run: () => this.sweepStagedImages() });
  }

  async preview(input: ReleasePreviewInput): Promise<ReleasePreview> {
    const keys = input.questions.map((q) => q.externalKey);
    const [rows, exams, subjects, topics] = await Promise.all([
      this.prisma.question.findMany({ where: { externalKey: { in: keys } }, select: RELEASE_ROW_SELECT }),
      this.prisma.exam.findMany({ where: { slug: { in: input.exams } }, select: { slug: true } }),
      this.prisma.subject.findMany({ where: { slug: { in: input.subjects } }, select: { slug: true } }),
      this.prisma.topic.findMany({
        where: { slug: { in: input.topics.map((t) => t.slug) } },
        select: { slug: true, subject: { select: { slug: true } } },
      }),
    ]);
    const byKey = new Map(rows.map((row) => [row.externalKey, row]));
    const existingTopics = new Map(topics.map((t) => [t.slug, t.subject.slug]));

    const questions = input.questions.map((q) => {
      const row = byKey.get(q.externalKey) ?? null;
      return { externalKey: q.externalKey, published: row?.status === 'PUBLISHED', ...classify(row, q.contentHash) };
    });

    const needed = new Set(
      input.questions
        .filter((_q, i) => writes(questions[i].verdict, true))
        .flatMap((q) => QUESTION_IMAGE_FIELDS.map((field) => imageIdsOf(q.images)[field]))
        .filter((sha): sha is string => Boolean(sha)),
    );
    const staged = await this.stagedImages([...needed]);

    const problems = input.topics
      .filter((t) => existingTopics.has(t.slug) && existingTopics.get(t.slug) !== t.subjectSlug)
      .map((t) => `Topic ${t.slug} is under subject ${existingTopics.get(t.slug)} here, not ${t.subjectSlug}.`);

    return {
      questions,
      create: {
        exams: input.exams.filter((slug) => !exams.some((e) => e.slug === slug)),
        subjects: input.subjects.filter((slug) => !subjects.some((s) => s.slug === slug)),
        topics: input.topics.filter((t) => !existingTopics.has(t.slug)).map((t) => t.slug),
      },
      missingImages: [...needed].filter((sha) => !staged.has(sha)),
      problems,
    };
  }

  async apply(input: ReleaseApplyInput, actorId: string): Promise<ReleaseApplyResult> {
    const questions = input.questions.map(releaseQuestionOf);
    this.importer.validateQuestions(questions.map(toImportQuestion));
    // The file's own hashes are re-derived here: a release edited by hand or
    // damaged on the way is refused, rather than recorded as something it is not.
    const mismatched = questions.filter((q) => hashQuestion(q, q.images) !== q.contentHash);
    if (mismatched.length) {
      throw new BadRequestException(
        `The release is damaged or was edited after export: content does not match its hash for ${mismatched
          .map((q) => q.externalKey)
          .join(', ')}. Export it again.`,
      );
    }

    await this.createMissingTaxonomy(input);
    const refs = await this.taxonomyIds(questions);
    const staged = await this.stagedImages(
      questions.flatMap((q) => QUESTION_IMAGE_FIELDS.map((f) => q.images[f])).filter((s): s is string => !!s),
    );
    const overwrite = new Set(input.overwrite);

    const results: ReleaseApplyResult['questions'] = [];
    for (const question of questions) {
      results.push({
        externalKey: question.externalKey,
        ...(await this.applyOne(question, overwrite.has(question.externalKey), refs, staged)),
      });
    }

    const count = (outcome: ReleaseOutcome) => results.filter((r) => r.outcome === outcome).length;
    const summary = {
      release: input.name,
      created: count('CREATED'),
      updated: count('UPDATED'),
      overwritten: count('OVERWRITTEN'),
      unchanged: count('UNCHANGED'),
      skipped: count('SKIPPED'),
      failed: count('FAILED'),
    };
    activity(this.logger, 'pyq.release_applied', { actorId, ...summary });
    await this.audit.record({
      actorUserId: actorId,
      action: 'pyq.release_applied',
      entityType: 'pyq_release',
      entityId: input.name,
      after: {
        ...summary,
        written: results.filter((r) => ['CREATED', 'UPDATED', 'OVERWRITTEN'].includes(r.outcome)).map((r) => r.externalKey),
      },
    });
    return { questions: results };
  }

  // --- one question ----------------------------------------------------------

  private async applyOne(
    question: ReleaseQuestion,
    overwrite: boolean,
    refs: Awaited<ReturnType<QuestionReleaseService['taxonomyIds']>>,
    staged: Map<string, StagedImage>,
  ): Promise<{ outcome: ReleaseOutcome; reason?: string }> {
    const before = await this.prisma.question.findUnique({
      where: { externalKey: question.externalKey },
      select: RELEASE_ROW_SELECT,
    });
    const first = classify(before, question.contentHash);
    if (first.verdict === 'UNCHANGED') return { outcome: 'UNCHANGED' };
    if (!writes(first.verdict, overwrite)) return { outcome: 'SKIPPED', reason: first.reason };

    const examId = refs.exams.get(question.examSlug);
    const subjectId = refs.subjects.get(question.subjectSlug);
    const topic = question.topicSlug ? refs.topics.get(question.topicSlug) : null;
    if (!examId || !subjectId) return { outcome: 'FAILED', reason: 'Its exam or subject is not here and the release does not describe it.' };
    if (question.topicSlug && (!topic || topic.subjectId !== subjectId)) {
      return { outcome: 'FAILED', reason: `Topic ${question.topicSlug} is missing here or under another subject.` };
    }
    const missing = QUESTION_IMAGE_FIELDS.filter((f) => question.images[f] && !staged.has(question.images[f]!));
    if (missing.length) return { outcome: 'FAILED', reason: `Its ${missing.join(' and ')} image is not uploaded. Run the push again.` };

    const id = before?.id ?? uuidv7();
    const copies = new Map<QuestionImageField, ObjectRef>();
    try {
      // Copied inside storage — the bytes never come through this server.
      for (const field of QUESTION_IMAGE_FIELDS) {
        const sha = question.images[field];
        if (!sha) continue;
        const from = staged.get(sha)!;
        copies.set(
          field,
          await this.storage.copy(from.ref, {
            visibility: 'PRIVATE',
            keyPrefix: questionImageKeyPrefix(id),
            originalFilename: `${field}${imageExtension(from.mimeType)}`,
          }),
        );
      }

      await this.prisma.$transaction(async (tx) => {
        // Held to commit: a second push, or an admin saving this question,
        // waits — and the verdict is decided on exactly what gets overwritten.
        await tx.$queryRaw`SELECT id FROM pyq.questions WHERE external_key = ${question.externalKey} FOR UPDATE`;
        const locked = await tx.question.findUnique({ where: { externalKey: question.externalKey }, select: RELEASE_ROW_SELECT });
        const now = classify(locked, question.contentHash);
        if (now.verdict !== first.verdict || locked?.releasedStateHash !== before?.releasedStateHash) {
          throw new ReleaseSkip('It changed here while the push was running. Preview again.');
        }

        // Every field set: an image the release does not have is removed here too.
        const images: QuestionExtraColumns = Object.assign(
          {},
          ...QUESTION_IMAGE_FIELDS.map((field) => questionImageFileData(field, copies.get(field) ?? null)),
        );
        const { id: writtenId } = await this.importer.writeQuestion(
          tx,
          toImportQuestion(question),
          { examId, subjectId, topicId: topic?.id ?? null },
          { id, extra: images },
        );
        const written = await tx.question.findUniqueOrThrow({ where: { id: writtenId }, select: RELEASE_ROW_SELECT });
        await tx.question.update({
          where: { id: writtenId },
          data: { releasedContentHash: question.contentHash, releasedStateHash: stateHash(written), releasedAt: new Date() },
        });
      });
    } catch (error) {
      for (const ref of copies.values()) await this.deleteQuietly(ref, 'copied for a question whose push failed');
      if (error instanceof ReleaseSkip) return { outcome: 'FAILED', reason: error.message };
      this.logger.error(`Release push of ${question.externalKey} failed: ${String(error)}`);
      return { outcome: 'FAILED', reason: 'Could not be saved. Run the push again; if it keeps failing, see the server log.' };
    }

    // Replaced images go once the new ones are saved — never before.
    if (before) {
      for (const field of QUESTION_IMAGE_FIELDS) {
        const old = questionImageRefOf(before, field);
        if (old) await this.deleteQuietly(old, 'replaced by a release push');
      }
    }
    return { outcome: first.verdict === 'NEW' ? 'CREATED' : first.verdict === 'CONFLICT' ? 'OVERWRITTEN' : 'UPDATED' };
  }

  // --- taxonomy --------------------------------------------------------------

  /** Creates the exams, subjects and topics the release describes and this environment lacks. Never changes one. */
  private async createMissingTaxonomy(input: ReleaseApplyInput): Promise<void> {
    for (const exam of input.exams) {
      await this.prisma.exam.upsert({
        where: { slug: exam.slug },
        create: {
          slug: exam.slug,
          name: exam.name,
          shortName: exam.shortName ?? exam.name,
          description: exam.description ?? null,
          sortOrder: exam.sortOrder ?? 0,
        },
        update: {},
      });
    }
    for (const subject of input.subjects) {
      await this.prisma.subject.upsert({
        where: { slug: subject.slug },
        create: {
          slug: subject.slug,
          name: subject.name,
          group: subject.group,
          description: subject.description ?? null,
          sortOrder: subject.sortOrder ?? 0,
        },
        update: {},
      });
    }
    for (const topic of input.topics) {
      const subject = await this.prisma.subject.findUnique({ where: { slug: topic.subjectSlug }, select: { id: true } });
      if (!subject) continue; // its questions fail with a reason
      await this.prisma.topic.upsert({
        where: { slug: topic.slug },
        create: { slug: topic.slug, subjectId: subject.id, name: topic.name, sortOrder: topic.sortOrder ?? 0 },
        update: {},
      });
    }
  }

  private async taxonomyIds(questions: ReleaseQuestion[]) {
    const [exams, subjects, topics] = await Promise.all([
      this.prisma.exam.findMany({ where: { slug: { in: questions.map((q) => q.examSlug) } }, select: { id: true, slug: true } }),
      this.prisma.subject.findMany({ where: { slug: { in: questions.map((q) => q.subjectSlug) } }, select: { id: true, slug: true } }),
      this.prisma.topic.findMany({
        where: { slug: { in: questions.map((q) => q.topicSlug).filter((s): s is string => Boolean(s)) } },
        select: { id: true, slug: true, subjectId: true },
      }),
    ]);
    return {
      exams: new Map(exams.map((e) => [e.slug, e.id])),
      subjects: new Map(subjects.map((s) => [s.slug, s.id])),
      topics: new Map(topics.map((t) => [t.slug, { id: t.id, subjectId: t.subjectId }])),
    };
  }

  // --- staged images ---------------------------------------------------------

  /** Uploaded release images by SHA-256, newest first — only ones the sweep will not take soon. */
  private async stagedImages(shas: string[]): Promise<Map<string, StagedImage>> {
    if (!shas.length) return new Map();
    const cutoff = new Date(Date.now() - this.retentionMs() + STAGED_SAFETY_MS);
    const rows = await this.prisma.$queryRaw<
      { sha256: string; storage_provider: ObjectRef['provider']; bucket: string; object_key: string; mime_type: string }[]
    >`
      SELECT context->>'sha256' AS sha256, storage_provider, bucket, object_key, mime_type
        FROM public.uploads
       WHERE purpose = ${RELEASE_IMAGE_PURPOSE}
         AND status = 'COMPLETED'
         AND finished_at > ${cutoff}
         AND context->>'sha256' = ANY(${shas})
       ORDER BY finished_at DESC`;
    const found = new Map<string, StagedImage>();
    for (const row of rows) {
      if (!found.has(row.sha256)) {
        found.set(row.sha256, {
          ref: { provider: row.storage_provider, bucket: row.bucket, objectKey: row.object_key },
          mimeType: row.mime_type,
        });
      }
    }
    return found;
  }

  /**
   * Deletes staged release images older than the retention: their objects,
   * then their upload rows — which exist only to find them again by content.
   */
  async sweepStagedImages() {
    const before = new Date(Date.now() - this.retentionMs());
    const old = await this.prisma.upload.findMany({
      where: { purpose: RELEASE_IMAGE_PURPOSE, status: UploadStatus.COMPLETED, finishedAt: { lte: before } },
      select: { id: true, storageProvider: true, bucket: true, objectKey: true },
      take: SWEEP_BATCH,
    });
    let removed = 0;
    for (const upload of old) {
      const ref = { provider: upload.storageProvider, bucket: upload.bucket, objectKey: upload.objectKey };
      if (await this.deleteQuietly(ref, 'staged for a release push, past its retention')) {
        await this.prisma.upload.delete({ where: { id: upload.id } }).catch(() => undefined);
        removed += 1;
      }
    }
    return { checked: old.length, removed };
  }

  private retentionMs(): number {
    return this.config.get('PYQ_RELEASE_IMAGE_RETENTION_HOURS') * HOUR_MS;
  }

  private async deleteQuietly(ref: ObjectRef, why: string): Promise<boolean> {
    try {
      await this.storage.delete(ref);
      return true;
    } catch (error) {
      this.logger.warn(`Could not delete ${ref.bucket}/${ref.objectKey} (${why}): ${String(error)}`);
      return false;
    }
  }
}

