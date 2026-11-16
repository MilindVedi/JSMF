import { createHash } from 'node:crypto';
import { QuestionStatus } from '@prisma/client';
import type { PrismaService } from '../../../shared/prisma/prisma.service';
import type { StorageService } from '../../storage/application/storage.service';
import { QUESTION_IMAGE_FIELDS, questionImageRefOf } from './question-image-links';
import { QUESTION_IMAGE_MIME_TYPES } from './question-image-uploads';
import {
  contentOfRow,
  hashQuestion,
  RELEASE_FORMAT,
  RELEASE_FORMAT_VERSION,
  RELEASE_NAME,
  RELEASE_ROW_SELECT,
  type ReleaseFile,
  type ReleaseImage,
  type ReleaseImageIds,
  sha256Hex,
} from './question-release';

export interface ExportReleaseOptions {
  /** Lowercase letters, digits, dot, dash, underscore — e.g. "fmge-2026-jan". */
  name: string;
  /** Which questions: every `externalKey` starting with one of these. */
  keyPrefixes: string[];
}

export interface ExportReleaseResult {
  release: ReleaseFile;
  /** Matching questions left out because they are not published — not yet approved. */
  skippedDrafts: string[];
}

/**
 * Builds a release from the editorial copy (question-release.ts): the
 * *published* questions matching `keyPrefixes` — publishing locally is the
 * reviewer's approval, so a draft never travels — with their images' bytes
 * and every exam, subject and topic they use.
 *
 * Read-only: it writes nothing to the database or storage. Each image is read
 * once, checked against the MD5 storage recorded for it, and stored once
 * however many questions share it.
 */
export async function exportRelease(
  prisma: PrismaService,
  storage: StorageService,
  options: ExportReleaseOptions,
): Promise<ExportReleaseResult> {
  if (!RELEASE_NAME.test(options.name)) {
    throw new Error(`Release name "${options.name}" must be lowercase letters, digits, ".", "-" or "_" (up to 80).`);
  }
  const prefixes = options.keyPrefixes.map((p) => p.trim()).filter(Boolean);
  if (!prefixes.length) throw new Error('Say which questions: at least one externalKey prefix.');

  const rows = await prisma.question.findMany({
    where: { deletedAt: null, OR: prefixes.map((prefix) => ({ externalKey: { startsWith: prefix } })) },
    select: RELEASE_ROW_SELECT,
    orderBy: { externalKey: 'asc' },
  });
  const published = rows.filter((row) => row.status === QuestionStatus.PUBLISHED);
  const skippedDrafts = rows.filter((row) => row.status !== QuestionStatus.PUBLISHED).map((row) => row.externalKey);
  if (!published.length) {
    throw new Error(
      rows.length
        ? `None of the ${rows.length} matching questions is published. Publish the reviewed ones locally first.`
        : `No questions match ${prefixes.join(', ')}.`,
    );
  }

  const images = new Map<string, ReleaseImage>();
  const questions = [];
  for (const row of published) {
    const ids: ReleaseImageIds = { stem: null, explanation: null };
    for (const field of QUESTION_IMAGE_FIELDS) {
      const ref = questionImageRefOf(row, field);
      if (!ref) continue;
      const info = await storage.stat(ref);
      if (!info) throw new Error(`${row.externalKey}: its ${field} image is missing from storage (${ref.bucket}/${ref.objectKey}).`);
      const bytes = await storage.readRange(ref, 0, info.sizeBytes - 1);
      const md5 = createHash('md5').update(bytes).digest('hex');
      if (bytes.length !== info.sizeBytes || (info.md5 && info.md5 !== md5)) {
        throw new Error(`${row.externalKey}: its ${field} image did not read back intact. Try again.`);
      }
      const contentType = info.mimeType ?? '';
      if (!(QUESTION_IMAGE_MIME_TYPES as readonly string[]).includes(contentType)) {
        throw new Error(`${row.externalKey}: its ${field} image is ${contentType || 'of unknown type'}, not PNG, JPEG or WebP.`);
      }
      const sha256 = sha256Hex(bytes);
      if (!images.has(sha256)) {
        images.set(sha256, { sha256, md5, contentType, sizeBytes: bytes.length, data: bytes.toString('base64') });
      }
      ids[field] = sha256;
    }
    const content = contentOfRow(row);
    questions.push({ ...content, images: ids, contentHash: hashQuestion(content, ids) });
  }

  const examSlugs = [...new Set(questions.map((q) => q.examSlug))];
  const subjectSlugs = [...new Set(questions.map((q) => q.subjectSlug))];
  const topicSlugs = [...new Set(questions.map((q) => q.topicSlug).filter((slug): slug is string => Boolean(slug)))];
  const [exams, subjects, topics] = await Promise.all([
    prisma.exam.findMany({
      where: { slug: { in: examSlugs } },
      select: { slug: true, name: true, shortName: true, description: true, sortOrder: true },
      orderBy: { slug: 'asc' },
    }),
    prisma.subject.findMany({
      where: { slug: { in: subjectSlugs } },
      select: { slug: true, name: true, group: true, description: true, sortOrder: true },
      orderBy: { slug: 'asc' },
    }),
    prisma.topic.findMany({
      where: { slug: { in: topicSlugs } },
      select: { slug: true, name: true, sortOrder: true, subject: { select: { slug: true } } },
      orderBy: { slug: 'asc' },
    }),
  ]);

  return {
    release: {
      format: RELEASE_FORMAT,
      version: RELEASE_FORMAT_VERSION,
      name: options.name,
      createdAt: new Date().toISOString(),
      exams: exams.map((e) => ({ ...e, description: e.description ?? null })),
      subjects: subjects.map((s) => ({ ...s, description: s.description ?? null })),
      topics: topics.map((t) => ({ slug: t.slug, subjectSlug: t.subject.slug, name: t.name, sortOrder: t.sortOrder })),
      questions,
      images: [...images.values()],
    },
    skippedDrafts,
  };
}
