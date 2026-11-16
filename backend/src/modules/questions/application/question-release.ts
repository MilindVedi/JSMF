import { createHash, randomBytes } from 'node:crypto';
import type { Difficulty, Prisma } from '@prisma/client';
import type { ObjectRef } from '../../storage/domain/storage-provider.port';
import type { ImportExam, ImportQuestion, ImportSubject, ImportTopic } from './question-import.service';
import {
  QUESTION_IMAGE_COLUMNS_SELECT,
  QUESTION_IMAGE_FIELDS,
  type QuestionImageField,
  questionImageRefOf,
} from './question-image-links';

/**
 * Content releases: how reviewed questions move from the editorial copy (the
 * local database, where questions are added and reviewed) to production.
 *
 * Code reaches production by deploying; content reaches it as a release — one
 * file, exported from the editorial copy (prisma/export-pyq-release.ts) and
 * pushed through production's admin API by an admin (QuestionReleaseService,
 * the admin Import page). Never by copying a database, never by writing to
 * production's database directly.
 *
 * - **Whole and authoritative.** A release question carries every field
 *   explicitly (null / [] for none) and its uploaded images by content, so
 *   pushing it makes production's copy exactly the reviewed one.
 * - **Idempotent.** Matched on `externalKey`; each question carries a
 *   `contentHash` (below). Production remembers the hash it last applied, so
 *   the same release again changes nothing, and an interrupted push is simply
 *   run again.
 * - **One-way, and safe about it.** The editorial copy is the master; in
 *   production an admin only publishes or unpublishes. Production also
 *   remembers how each question looked right after its last push (the state
 *   hash), so an edit made there since — a typo fixed after a student's
 *   report — is reported as a conflict and never overwritten unless the admin
 *   ticks that question.
 * - **Status never travels.** A new question arrives as a DRAFT; an existing
 *   one keeps its status. Publishing in production stays a decision made there.
 * - **Exams, subjects and topics are created when missing, never changed** —
 *   names are managed in each environment's admin.
 */

export const RELEASE_FORMAT = 'jsmf-pyq-release';
export const RELEASE_FORMAT_VERSION = 1;

/** Where images uploaded for a push wait, in the private bucket, until the push copies them to their question. */
export const RELEASE_IMAGE_KEY_PREFIX = 'pyq/release-images';

/** The upload purpose a push sends its images through. */
export const RELEASE_IMAGE_PURPOSE = 'pyq.release_image';

export const SHA256_HEX = /^[0-9a-f]{64}$/;
export const MD5_HEX = /^[0-9a-f]{32}$/;
/** A release's name: what it is called in the file name, the audit log and the admin page. */
export const RELEASE_NAME = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export interface ReleaseOption {
  text: string;
  imageUrl: string | null;
  isCorrect: boolean;
  explanation: string | null;
}

/** A question's content as a release carries it: the import shape, every field explicit. Never its status. */
export interface ReleaseQuestionContent {
  externalKey: string;
  examSlug: string;
  subjectSlug: string;
  topicSlug: string | null;
  year: number;
  sessionMonth: number | null;
  stem: string;
  /** A pasted link to an image hosted elsewhere — not an uploaded image (`images`). */
  stemImageUrl: string | null;
  stemFigure: Prisma.JsonValue | null;
  explanation: string;
  explanationImageUrl: string | null;
  explanationFigure: Prisma.JsonValue | null;
  pearls: string[];
  quickRevision: string | null;
  difficulty: Difficulty;
  keepOptionOrder: boolean;
  options: ReleaseOption[];
}

/**
 * A question's uploaded images by identity, one per field or null: in a
 * release, the SHA-256 of the bytes (hex); in a database, the stored object.
 */
export type ReleaseImageIds = Record<QuestionImageField, string | null>;

export interface ReleaseQuestion extends ReleaseQuestionContent {
  images: ReleaseImageIds;
  /** `hashQuestion(content, images)` — checked again by the server, which refuses a mismatch. */
  contentHash: string;
}

/** An uploaded image, once per distinct content however many questions use it. */
export interface ReleaseImage {
  sha256: string;
  /** Hex. The server checks the uploaded bytes against it, so they are the exported ones. */
  md5: string;
  contentType: string;
  sizeBytes: number;
  /** The bytes, base64. */
  data: string;
}

/** The release file: one JSON document, so one file is one release. */
export interface ReleaseFile {
  format: typeof RELEASE_FORMAT;
  version: typeof RELEASE_FORMAT_VERSION;
  name: string;
  createdAt: string;
  /** Every exam, subject and topic its questions use, described in full. */
  exams: ImportExam[];
  subjects: ImportSubject[];
  topics: ImportTopic[];
  questions: ReleaseQuestion[];
  images: ReleaseImage[];
}

/** JSON with every object's keys sorted, so equal content always hashes equal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * The content fields of anything question-shaped, and nothing else — so a
 * stray property (a status, the hash itself) can never change a hash.
 * Missing optional fields become their explicit "none".
 */
export function contentOf(question: ImportQuestion | ReleaseQuestionContent): ReleaseQuestionContent {
  return {
    externalKey: question.externalKey,
    examSlug: question.examSlug,
    subjectSlug: question.subjectSlug,
    topicSlug: question.topicSlug ?? null,
    year: question.year,
    sessionMonth: question.sessionMonth ?? null,
    stem: question.stem,
    stemImageUrl: question.stemImageUrl ?? null,
    stemFigure: (question.stemFigure ?? null) as Prisma.JsonValue | null,
    explanation: question.explanation,
    explanationImageUrl: question.explanationImageUrl ?? null,
    explanationFigure: (question.explanationFigure ?? null) as Prisma.JsonValue | null,
    pearls: question.pearls ?? [],
    quickRevision: question.quickRevision ?? null,
    difficulty: question.difficulty,
    keepOptionOrder: question.keepOptionOrder ?? false,
    options: question.options.map((option) => ({
      text: option.text,
      imageUrl: option.imageUrl ?? null,
      isCorrect: option.isCorrect,
      explanation: option.explanation ?? null,
    })),
  };
}

/** Image identities with both fields explicit — a missing one is none. */
export function imageIdsOf(images: Partial<Record<QuestionImageField, string | null>> | null | undefined): ReleaseImageIds {
  return { stem: images?.stem ?? null, explanation: images?.explanation ?? null };
}

/** The hash of a question's content plus its images' identities. */
export function hashQuestion(
  content: ImportQuestion | ReleaseQuestionContent,
  images: Partial<Record<QuestionImageField, string | null>>,
): string {
  return sha256Hex(canonicalJson({ ...contentOf(content), images: imageIdsOf(images) }));
}

/** A release question as received: the import shape, its images and its hash. */
export type ReleaseQuestionInput = ImportQuestion & {
  images: Partial<Record<QuestionImageField, string | null>>;
  contentHash: string;
};

/** A received release question, made exact: every content field explicit, both image fields set. */
export function releaseQuestionOf(input: ReleaseQuestionInput): ReleaseQuestion {
  return { ...contentOf(input), images: imageIdsOf(input.images), contentHash: input.contentHash };
}

/**
 * The release content as the import writes it: every field explicit, so null
 * and [] clear what is there, and no status — a new question is a DRAFT, an
 * existing one keeps its own.
 */
export function toImportQuestion(content: ReleaseQuestionContent): ImportQuestion {
  const exact = contentOf(content);
  return {
    ...exact,
    stemFigure: exact.stemFigure as Prisma.InputJsonValue | null,
    explanationFigure: exact.explanationFigure as Prisma.InputJsonValue | null,
  };
}

/** What a release question needs from the database: content, images, release columns. */
export const RELEASE_ROW_SELECT = {
  id: true,
  externalKey: true,
  status: true,
  deletedAt: true,
  year: true,
  sessionMonth: true,
  stem: true,
  stemFigure: true,
  explanation: true,
  explanationFigure: true,
  pearls: true,
  quickRevision: true,
  difficulty: true,
  keepOptionOrder: true,
  releasedContentHash: true,
  releasedStateHash: true,
  releasedAt: true,
  ...QUESTION_IMAGE_COLUMNS_SELECT,
  exam: { select: { slug: true } },
  subject: { select: { slug: true } },
  topic: { select: { slug: true } },
  options: {
    orderBy: { sortOrder: 'asc' },
    select: { text: true, imageUrl: true, isCorrect: true, explanation: true },
  },
} satisfies Prisma.QuestionSelect;

export type ReleaseRow = Prisma.QuestionGetPayload<{ select: typeof RELEASE_ROW_SELECT }>;

/** A stored question's content, in release shape. */
export function contentOfRow(row: ReleaseRow): ReleaseQuestionContent {
  return contentOf({
    externalKey: row.externalKey,
    examSlug: row.exam.slug,
    subjectSlug: row.subject.slug,
    topicSlug: row.topic?.slug ?? null,
    year: row.year,
    sessionMonth: row.sessionMonth,
    stem: row.stem,
    stemImageUrl: row.stemImageUrl,
    stemFigure: row.stemFigure,
    explanation: row.explanation,
    explanationImageUrl: row.explanationImageUrl,
    explanationFigure: row.explanationFigure,
    pearls: row.pearls,
    quickRevision: row.quickRevision,
    difficulty: row.difficulty,
    keepOptionOrder: row.keepOptionOrder,
    options: row.options,
  });
}

/** A stored image's identity for the state hash: where it is. Every upload gets a new key, so a new image is a new identity. */
export function objectIdentity(ref: ObjectRef | null): string | null {
  return ref ? `${ref.provider}:${ref.bucket}/${ref.objectKey}` : null;
}

/** A stored question's images, by stored object. */
export function storedImageIds(row: ReleaseRow): ReleaseImageIds {
  return Object.fromEntries(
    QUESTION_IMAGE_FIELDS.map((field) => [field, objectIdentity(questionImageRefOf(row, field))]),
  ) as ReleaseImageIds;
}

/** How a stored question looks now: compared with the state its last push recorded. */
export function stateHash(row: ReleaseRow): string {
  return hashQuestion(contentOfRow(row), storedImageIds(row));
}

/** What a push would do with one question. */
export type ReleaseVerdict = 'NEW' | 'CHANGED' | 'UNCHANGED' | 'CONFLICT' | 'DELETED';

export interface ReleaseClassification {
  verdict: ReleaseVerdict;
  /** Why, for a CONFLICT or DELETED. */
  reason?: string;
}

/**
 * NEW: not here. UNCHANGED: here, as this content's last push left it.
 * CHANGED: here, untouched since its last push, and the release has newer
 * content. CONFLICT: here, but edited since its last push — or never pushed
 * at all (imported or written by hand) — so overwriting it would lose work;
 * pushed only when the admin ticks it. DELETED: deleted here; left alone.
 */
export function classify(row: ReleaseRow | null, contentHash: string): ReleaseClassification {
  if (!row) return { verdict: 'NEW' };
  if (row.deletedAt) return { verdict: 'DELETED', reason: 'Deleted here — a push leaves it alone.' };
  if (!row.releasedStateHash || !row.releasedAt) {
    return { verdict: 'CONFLICT', reason: 'Already here, but not from a release (imported or written by hand).' };
  }
  if (stateHash(row) !== row.releasedStateHash) {
    return {
      verdict: 'CONFLICT',
      reason: `Edited here since its last push (${row.releasedAt.toISOString().slice(0, 10)}).`,
    };
  }
  return row.releasedContentHash === contentHash ? { verdict: 'UNCHANGED' } : { verdict: 'CHANGED' };
}

/** Verdicts a push writes; a CONFLICT only when the admin chose to overwrite it. */
export function writes(verdict: ReleaseVerdict, overwrite: boolean): boolean {
  return verdict === 'NEW' || verdict === 'CHANGED' || (verdict === 'CONFLICT' && overwrite);
}

/** The file extension for an image type, for the stored object's name. */
export function imageExtension(contentType: string): string {
  return { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[contentType] ?? '';
}

/**
 * A version-7 UUID (RFC 9562): time-ordered, like the ids Prisma makes. For a
 * new question whose id is needed before it is written — its images are
 * copied under `pyq/questions/<id>/` first, so the question and its images
 * arrive in one transaction.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  // 48-bit big-endian milliseconds. Bitwise ops keep the low 32 bits, which
  // still carry each byte's bits correctly.
  for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(now / 2 ** (8 * (5 - i))) & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
