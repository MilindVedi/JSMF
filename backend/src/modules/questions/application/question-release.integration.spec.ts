import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Difficulty, QuestionStatus, UploadStatus, UserStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { StorageService } from '../../storage/application/storage.service';
import { LocalStorageAdapter } from '../../storage/infrastructure/local-storage.adapter';
import { UploadPurposeRegistry, type UploadActor } from '../../uploads/application/upload-purpose';
import { UploadService } from '../../uploads/application/upload.service';
import { questionImageFileData, questionImageRefOf } from './question-image-links';
import { questionImageKeyPrefix } from './question-image-uploads';
import { type ImportQuestion, QuestionImportService } from './question-import.service';
import {
  canonicalJson,
  contentOf,
  contentOfRow,
  hashQuestion,
  RELEASE_IMAGE_PURPOSE,
  RELEASE_ROW_SELECT,
  type ReleaseFile,
  type ReleaseImage,
  stateHash,
  uuidv7,
} from './question-release';
import { exportRelease } from './question-release-export';
import { QuestionReleaseService } from './question-release.service';

/**
 * Content releases end to end against a real Postgres and the real local-disk
 * storage driver (which speaks GCS's resumable protocol): export from one
 * copy, push into a copy that has none of it, push again, change, conflict.
 * Source and target are the same database here, so the "target" is made
 * empty by deleting this run's rows between export and push. Every row is
 * this run's own (unique slugs and keys) and deleted afterwards by them.
 */

let root: string;
const env: Record<string, unknown> = {
  STORAGE_PRIVATE_BUCKET: 'private',
  STORAGE_PUBLIC_BUCKET: 'public',
  APP_PUBLIC_URL: 'http://localhost:4000/api',
  STORAGE_SIGNING_SECRET: 'test-signing-secret-at-least-16',
  STORAGE_SIGNED_URL_TTL_SECONDS: 300,
  MAX_IMAGE_UPLOAD_SIZE_MB: 1,
  DIRECT_UPLOAD_CHUNK_MB: 1,
  DIRECT_UPLOAD_EXPIRY_HOURS: 24,
  PYQ_RELEASE_IMAGE_RETENTION_HOURS: 168,
  CORS_ORIGINS: ['http://localhost:3001'],
  STOREFRONT_URL: 'http://localhost:3001',
};
const config = {
  get: (key: string) => (key === 'STORAGE_LOCAL_ROOT' ? root : (env[key] ?? process.env[key])),
} as never;

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const registry = new UploadPurposeRegistry();
const importer = new QuestionImportService(prisma);
let local: LocalStorageAdapter;
let storage: StorageService;
let uploads: UploadService;
let releases: QuestionReleaseService;
let admin: UploadActor;

const tag = randomUUID().slice(0, 8);
const EXAM = `rel-exam-${tag}`;
const SUBJECT = `rel-subject-${tag}`;
const TOPIC = `${SUBJECT}--bones`;
const PREFIX = `rel-${tag}-`;
const KEY = (i: number) => `${PREFIX}${i}`;
const NAME = `spec-${tag}`;
const userIds: string[] = [];

const png = (seed: string) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`${seed}-${randomUUID()}`), Buffer.alloc(512)]);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const md5 = (bytes: Buffer) => createHash('md5').update(bytes).digest('hex');
const imageOf = (bytes: Buffer): ReleaseImage => ({
  sha256: sha256(bytes),
  md5: md5(bytes),
  contentType: 'image/png',
  sizeBytes: bytes.length,
  data: bytes.toString('base64'),
});

function question(i: number): ImportQuestion {
  return {
    externalKey: KEY(i),
    examSlug: EXAM,
    subjectSlug: SUBJECT,
    topicSlug: TOPIC,
    year: 2026,
    sessionMonth: 1,
    stem: `Release question ${i}`,
    explanation: `Because ${i}`,
    pearls: ['Pearl one', 'Pearl two'],
    quickRevision: 'Remember this.',
    difficulty: Difficulty.MEDIUM,
    keepOptionOrder: i === 1,
    options: [
      { text: 'Right', isCorrect: true, explanation: 'It is right.' },
      { text: 'Wrong', isCorrect: false, explanation: 'It is wrong.' },
      { text: 'All of the above', isCorrect: false },
    ],
  };
}

async function* asBody(piece: Buffer) {
  yield piece;
}

/** Uploads a release image the way the admin page does: start, send, complete. */
async function stage(image: ReleaseImage, context: Record<string, unknown> = { sha256: image.sha256, md5: image.md5 }) {
  const bytes = Buffer.from(image.data, 'base64');
  const session = await uploads.start(
    {
      purpose: RELEASE_IMAGE_PURPOSE,
      targetId: null,
      context,
      filename: `${image.sha256}.png`,
      mimeType: image.contentType,
      sizeBytes: bytes.length,
      origin: 'http://localhost:3001',
    },
    admin,
  );
  await local.receiveUpload(
    local.verifyUploadToken(session.uploadUrl.split('/').pop()!)!,
    `bytes 0-${bytes.length - 1}/${bytes.length}`,
    asBody(bytes),
  );
  await uploads.complete(session.uploadId, admin);
  return session.uploadId;
}

const previewInput = (file: ReleaseFile) => ({
  name: file.name,
  exams: file.exams.map((e) => e.slug),
  subjects: file.subjects.map((s) => s.slug),
  topics: file.topics.map((t) => ({ slug: t.slug, subjectSlug: t.subjectSlug })),
  questions: file.questions.map((q) => ({ externalKey: q.externalKey, contentHash: q.contentHash, images: q.images })),
});
const applyInput = (file: ReleaseFile, overwrite: string[] = []) => ({
  name: file.name,
  exams: file.exams,
  subjects: file.subjects,
  topics: file.topics,
  questions: file.questions,
  overwrite,
});
const verdicts = async (file: ReleaseFile) =>
  (await releases.preview(previewInput(file))).questions.map((q) => q.verdict);
const outcomes = async (file: ReleaseFile, overwrite: string[] = []) =>
  (await releases.apply(applyInput(file, overwrite), admin.id)).questions.map((q) => q.outcome);
const stored = (key: string) => prisma.question.findUniqueOrThrow({ where: { externalKey: key }, select: RELEASE_ROW_SELECT });

/** A copy of a release with one question changed and its hash recomputed — what a later export would produce. */
function revised(file: ReleaseFile, key: string, change: (q: ReleaseFile['questions'][number]) => void): ReleaseFile {
  const copy = structuredClone(file);
  const q = copy.questions.find((x) => x.externalKey === key)!;
  change(q);
  q.contentHash = hashQuestion(q, q.images);
  return copy;
}

/** Deletes this run's questions and taxonomy: the "production" that has none of it. */
async function emptyTarget() {
  await prisma.question.deleteMany({ where: { externalKey: { startsWith: PREFIX } } });
  await prisma.topic.deleteMany({ where: { slug: TOPIC } });
  await prisma.subject.deleteMany({ where: { slug: SUBJECT } });
  await prisma.exam.deleteMany({ where: { slug: EXAM } });
}

const sourceImage = png('source');
let file: ReleaseFile;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'jsmf-releases-'));
  local = new LocalStorageAdapter(config);
  storage = new StorageService(local, [local]);
  uploads = new UploadService(prisma, storage, registry, audit, config, new SweepRegistry());
  releases = new QuestionReleaseService(prisma, storage, registry, importer, audit, config, new SweepRegistry());
  releases.onModuleInit();

  const user = await prisma.user.create({ data: { email: `releases-${tag}@jsmf.test`, name: 'Release admin', status: UserStatus.ACTIVE } });
  userIds.push(user.id);
  admin = { id: user.id, roles: ['ADMIN'] };

  // The editorial copy: two reviewed (published) questions, one still a draft;
  // question 0 has an uploaded image.
  await importer.import({
    exams: [{ slug: EXAM, name: 'Release Exam', shortName: 'REL' }],
    subjects: [{ slug: SUBJECT, name: 'Release Subject', group: 'clinical' }],
    topics: [{ slug: TOPIC, subjectSlug: SUBJECT, name: 'Bones' }],
    questions: [question(0), question(1), question(2)],
  });
  await prisma.question.updateMany({ where: { externalKey: { in: [KEY(0), KEY(1)] } }, data: { status: QuestionStatus.PUBLISHED } });
  const q0 = await stored(KEY(0));
  const image = await storage.upload({
    content: sourceImage,
    originalFilename: 'xray.png',
    mimeType: 'image/png',
    visibility: 'PRIVATE',
    keyPrefix: questionImageKeyPrefix(q0.id),
  });
  await prisma.question.update({ where: { id: q0.id }, data: questionImageFileData('stem', image) });
});

afterAll(async () => {
  await prisma.question.deleteMany({ where: { externalKey: { startsWith: PREFIX } } });
  await prisma.topic.deleteMany({ where: { slug: TOPIC } });
  await prisma.subject.deleteMany({ where: { slug: SUBJECT } });
  await prisma.exam.deleteMany({ where: { slug: EXAM } });
  await prisma.upload.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe('release hashing', () => {
  it('hashes content, not key order, status, stray fields or missing-versus-null', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
    const q = question(0);
    const images = { stem: 'a'.repeat(64), explanation: null };
    const base = hashQuestion(q, images);
    expect(hashQuestion({ ...q, status: QuestionStatus.PUBLISHED }, images)).toBe(base);
    expect(hashQuestion({ ...q, extra: 'x' } as ImportQuestion, { stem: 'a'.repeat(64) })).toBe(base);
    expect(hashQuestion({ ...q, stem: `${q.stem}!` }, images)).not.toBe(base);
    expect(hashQuestion(q, { stem: 'b'.repeat(64), explanation: null })).not.toBe(base);
    expect(hashQuestion({ ...q, options: [q.options[1], q.options[0], q.options[2]] }, images)).not.toBe(base);
  });

  it('makes time-ordered version-7 ids', () => {
    const [a, b] = [uuidv7(1_700_000_000_000), uuidv7(1_700_000_000_001)];
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.slice(0, 13) < b.slice(0, 13)).toBe(true);
    expect(a.replace(/-/g, '').slice(0, 12)).toBe((1_700_000_000_000).toString(16).padStart(12, '0'));
  });
});

describe('export', () => {
  it('takes only published questions, with images by content and their taxonomy in full', async () => {
    const { release, skippedDrafts } = await exportRelease(prisma, storage, { name: NAME, keyPrefixes: [PREFIX] });
    expect(release).toMatchObject({ format: 'jsmf-pyq-release', version: 1, name: NAME });
    expect(release.questions.map((q) => q.externalKey)).toEqual([KEY(0), KEY(1)]);
    expect(skippedDrafts).toEqual([KEY(2)]);
    expect(release.images).toEqual([imageOf(sourceImage)]);
    expect(release.questions[0].images).toEqual({ stem: sha256(sourceImage), explanation: null });
    expect(release.questions[1].images).toEqual({ stem: null, explanation: null });
    for (const q of release.questions) expect(q.contentHash).toBe(hashQuestion(q, q.images));
    expect(release.questions[0]).not.toHaveProperty('status');
    expect(release.exams).toEqual([{ slug: EXAM, name: 'Release Exam', shortName: 'REL', description: null, sortOrder: 0 }]);
    expect(release.subjects).toEqual([{ slug: SUBJECT, name: 'Release Subject', group: 'clinical', description: null, sortOrder: 0 }]);
    expect(release.topics).toEqual([{ slug: TOPIC, subjectSlug: SUBJECT, name: 'Bones', sortOrder: 0 }]);
    // As the admin page reads it: the file, parsed.
    file = JSON.parse(JSON.stringify(release)) as ReleaseFile;
  });

  it('refuses a name that is not file-safe, and a selection with nothing approved', async () => {
    await expect(exportRelease(prisma, storage, { name: 'FMGE Jan', keyPrefixes: [PREFIX] })).rejects.toThrow(/lowercase/);
    await expect(exportRelease(prisma, storage, { name: NAME, keyPrefixes: [KEY(2)] })).rejects.toThrow(/None of the 1 matching questions is published/);
  });
});

describe('push', () => {
  it('into an environment with none of it: new questions arrive as drafts, exactly as exported', async () => {
    await emptyTarget();

    const before = await releases.preview(previewInput(file));
    expect(before.questions.map((q) => q.verdict)).toEqual(['NEW', 'NEW']);
    expect(before.create).toEqual({ exams: [EXAM], subjects: [SUBJECT], topics: [TOPIC] });
    expect(before.missingImages).toEqual([sha256(sourceImage)]);

    await stage(file.images[0]);
    expect((await releases.preview(previewInput(file))).missingImages).toEqual([]);

    expect(await outcomes(file)).toEqual(['CREATED', 'CREATED']);
    for (const q of file.questions) {
      const row = await stored(q.externalKey);
      expect(row.status).toBe(QuestionStatus.DRAFT);
      expect(contentOfRow(row)).toEqual(contentOf(q));
      expect(row.releasedContentHash).toBe(q.contentHash);
      expect(row.releasedStateHash).toBe(stateHash(row));
    }
    const row0 = await stored(KEY(0));
    const image = questionImageRefOf(row0, 'stem')!;
    expect(image.objectKey.startsWith(`${questionImageKeyPrefix(row0.id)}/`)).toBe(true);
    expect(await storage.readRange(image, 0, sourceImage.length - 1)).toEqual(sourceImage);
    expect(await prisma.subject.findUniqueOrThrow({ where: { slug: SUBJECT } })).toMatchObject({ name: 'Release Subject', group: 'clinical' });
    expect(await prisma.auditLog.findFirst({ where: { entityType: 'pyq_release', entityId: NAME } })).toMatchObject({
      action: 'pyq.release_applied',
      actorUserId: admin.id,
    });
  });

  it('pushing the same release again changes nothing', async () => {
    const [q0, q1] = [await stored(KEY(0)), await stored(KEY(1))];
    expect(await outcomes(file)).toEqual(['UNCHANGED', 'UNCHANGED']);
    expect(await stored(KEY(0))).toEqual(q0);
    expect(await stored(KEY(1))).toEqual(q1);
  });

  it('publishing here is not an edit', async () => {
    await prisma.question.update({ where: { externalKey: KEY(0) }, data: { status: QuestionStatus.PUBLISHED } });
    expect(await verdicts(file)).toEqual(['UNCHANGED', 'UNCHANGED']);
  });

  it('a newer release updates in place: status and option ids kept, the image swapped and the old one deleted', async () => {
    const newImage = imageOf(png('new'));
    const newer = revised(file, KEY(0), (q) => {
      q.stem = `${q.stem} (corrected)`;
      q.images.stem = newImage.sha256;
    });
    newer.images.push(newImage);
    const before = await stored(KEY(0));
    const optionIds = (await prisma.questionOption.findMany({ where: { questionId: before.id }, orderBy: { sortOrder: 'asc' } })).map((o) => o.id);

    const preview = await releases.preview(previewInput(newer));
    expect(preview.questions[0]).toMatchObject({ verdict: 'CHANGED', published: true });
    expect(preview.missingImages).toEqual([newImage.sha256]);
    await stage(newImage);

    expect(await outcomes(newer)).toEqual(['UPDATED', 'UNCHANGED']);
    const after = await stored(KEY(0));
    expect(after.stem).toBe('Release question 0 (corrected)');
    expect(after.status).toBe(QuestionStatus.PUBLISHED);
    expect((await prisma.questionOption.findMany({ where: { questionId: after.id }, orderBy: { sortOrder: 'asc' } })).map((o) => o.id)).toEqual(optionIds);
    expect(await storage.exists(questionImageRefOf(before, 'stem')!)).toBe(false);
    expect(await storage.readRange(questionImageRefOf(after, 'stem')!, 0, 9)).toEqual(Buffer.from(newImage.data, 'base64').subarray(0, 10));
    file = newer;
  });

  it('an edit made here since the last push is a conflict, overwritten only when the admin chooses', async () => {
    await prisma.question.update({ where: { externalKey: KEY(1) }, data: { stem: 'Fixed here after a report' } });
    const preview = await releases.preview(previewInput(file));
    expect(preview.questions[1]).toMatchObject({ verdict: 'CONFLICT', reason: expect.stringMatching(/Edited here since its last push/) });

    expect(await outcomes(file)).toEqual(['UNCHANGED', 'SKIPPED']);
    expect((await stored(KEY(1))).stem).toBe('Fixed here after a report');

    expect(await outcomes(file, [KEY(1)])).toEqual(['UNCHANGED', 'OVERWRITTEN']);
    expect((await stored(KEY(1))).stem).toBe('Release question 1');
    expect(await verdicts(file)).toEqual(['UNCHANGED', 'UNCHANGED']);
  });

  it('a question here that never came from a release is a conflict too', async () => {
    await importer.import({ questions: [{ ...question(3), examSlug: EXAM, subjectSlug: SUBJECT }] });
    const row = await stored(KEY(3));
    const q = { ...contentOfRow(row), images: { stem: null, explanation: null } };
    const other = { ...file, questions: [{ ...q, contentHash: hashQuestion(q, q.images) }] };
    expect((await releases.preview(previewInput(other))).questions[0]).toMatchObject({
      verdict: 'CONFLICT',
      reason: expect.stringMatching(/not from a release/),
    });
  });

  it('refuses a release whose content does not match its hash', async () => {
    const tampered = structuredClone(file);
    tampered.questions[1].stem = 'Edited in the file by hand';
    await expect(releases.apply(applyInput(tampered), admin.id)).rejects.toThrow(/damaged or was edited after export/);
    expect((await stored(KEY(1))).stem).toBe('Release question 1');
  });

  it('never renames an exam, subject or topic that exists here', async () => {
    await prisma.subject.update({ where: { slug: SUBJECT }, data: { name: 'Named here' } });
    const newer = revised(file, KEY(1), (q) => {
      q.explanation = 'Because, more clearly.';
    });
    expect(await outcomes(newer)).toEqual(['UNCHANGED', 'UPDATED']);
    expect((await prisma.subject.findUniqueOrThrow({ where: { slug: SUBJECT } })).name).toBe('Named here');
    file = newer;
  });

  it('writes nothing for a question whose image was never uploaded', async () => {
    const unsent = imageOf(png('unsent'));
    const q = { ...contentOf(question(4)), images: { stem: unsent.sha256, explanation: null } };
    const withNew = { ...file, questions: [{ ...q, contentHash: hashQuestion(q, q.images) }], images: [unsent] };
    expect((await releases.apply(applyInput(withNew), admin.id)).questions[0]).toMatchObject({
      outcome: 'FAILED',
      reason: expect.stringMatching(/not uploaded/),
    });
    expect(await prisma.question.count({ where: { externalKey: KEY(4) } })).toBe(0);
  });

  it('removes an image the release no longer has', async () => {
    const before = await stored(KEY(0));
    const newer = revised(file, KEY(0), (q) => {
      q.images.stem = null;
    });
    expect(await outcomes(newer)).toEqual(['UPDATED', 'UNCHANGED']);
    const after = await stored(KEY(0));
    expect(questionImageRefOf(after, 'stem')).toBeNull();
    expect(await storage.exists(questionImageRefOf(before, 'stem')!)).toBe(false);
    file = newer;
  });

  it('leaves a question deleted here alone', async () => {
    await prisma.question.update({ where: { externalKey: KEY(1) }, data: { deletedAt: new Date() } });
    const newer = revised(file, KEY(1), (q) => {
      q.stem = 'Changed again';
    });
    expect(await verdicts(newer)).toEqual(['UNCHANGED', 'DELETED']);
    expect(await outcomes(newer)).toEqual(['UNCHANGED', 'SKIPPED']);
    expect((await stored(KEY(1))).stem).toBe('Release question 1');
  });
});

describe('release images', () => {
  it('are refused unless the bytes are exactly the exported ones', async () => {
    const image = imageOf(png('checked'));
    await expect(stage(image, { sha256: image.sha256, md5: '0'.repeat(32) })).rejects.toThrow(/checksum differs/);
    await expect(stage(image, { sha256: 'not-a-hash', md5: image.md5 })).rejects.toThrow(/sha256 and md5/);
  });

  it('are swept once past their retention, and kept until then', async () => {
    const image = imageOf(png('sweep'));
    const uploadId = await stage(image);
    const upload = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId } });
    const ref = { provider: upload.storageProvider, bucket: upload.bucket, objectKey: upload.objectKey };

    await releases.sweepStagedImages();
    expect(await storage.exists(ref)).toBe(true);

    await prisma.upload.update({ where: { id: uploadId }, data: { finishedAt: new Date(Date.now() - 169 * 3600_000) } });
    expect((await releases.sweepStagedImages()).removed).toBeGreaterThanOrEqual(1);
    expect(await storage.exists(ref)).toBe(false);
    expect(await prisma.upload.findUnique({ where: { id: uploadId } })).toBeNull();
    expect(upload.status).toBe(UploadStatus.COMPLETED);
  });
});
