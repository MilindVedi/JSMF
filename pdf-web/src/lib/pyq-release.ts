/**
 * A content release file, read in the browser before a push (the backend's
 * modules/questions/application/question-release.ts has the whole design).
 *
 * `loadRelease` checks the file is a release this admin understands and that
 * every image's bytes hash to the SHA-256 the file records — so what gets
 * uploaded is exactly what was exported (the server checks each upload's MD5
 * too). The request builders split a release into requests under the API's
 * 100 KB body limit, each carrying only the exams, subjects and topics its own
 * questions use.
 */

export const RELEASE_FORMAT = "jsmf-pyq-release";
export const RELEASE_FORMAT_VERSION = 1;

/** Room under the API's 100 KB request limit for a chunk's JSON, in bytes. */
const BODY_BUDGET_BYTES = 80 * 1024;
/** The server's per-request caps (backend release.dto.ts). */
const MAX_APPLY_QUESTIONS = 50;
const MAX_PREVIEW_QUESTIONS = 150;

export interface ReleaseImageIds {
  stem: string | null;
  explanation: string | null;
}

/** A release question: the import shape plus its images and hash. Only what the page reads is typed. */
export interface ReleaseQuestion {
  externalKey: string;
  examSlug: string;
  subjectSlug: string;
  topicSlug: string | null;
  images: ReleaseImageIds;
  contentHash: string;
  [field: string]: unknown;
}

export interface ReleaseImage {
  sha256: string;
  md5: string;
  contentType: string;
  sizeBytes: number;
  data: string;
}

export interface ReleaseFile {
  format: string;
  version: number;
  name: string;
  createdAt: string;
  exams: { slug: string; [field: string]: unknown }[];
  subjects: { slug: string; [field: string]: unknown }[];
  topics: { slug: string; subjectSlug: string; [field: string]: unknown }[];
  questions: ReleaseQuestion[];
  images: ReleaseImage[];
}

export interface LoadedRelease {
  file: ReleaseFile;
  /** Each image as a file to upload, by SHA-256. */
  images: Map<string, File>;
  sizeBytes: number;
}

const EXTENSIONS: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

function base64ToBytes(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Reads and checks a release file. Throws an Error whose message is for the admin. */
export async function loadRelease(source: File): Promise<LoadedRelease> {
  let file: ReleaseFile;
  try {
    file = JSON.parse(await source.text()) as ReleaseFile;
  } catch {
    throw new Error("This is not a release file: it is not valid JSON.");
  }
  if (file?.format !== RELEASE_FORMAT) {
    throw new Error(
      "This is not a release file. Export one with “npm run pyq:release:export”, or use Import questions below for a plain question file.",
    );
  }
  if (file.version !== RELEASE_FORMAT_VERSION) {
    throw new Error(
      `This release is format version ${file.version}; this admin reads version ${RELEASE_FORMAT_VERSION}. Deploy the matching version first.`,
    );
  }
  if (!Array.isArray(file.questions) || !file.questions.length || !Array.isArray(file.images)) {
    throw new Error("This release file has no questions.");
  }

  const images = new Map<string, File>();
  for (const image of file.images) {
    const bytes = base64ToBytes(image.data);
    if (bytes.length !== image.sizeBytes || hex(await crypto.subtle.digest("SHA-256", bytes)) !== image.sha256) {
      throw new Error(`An image in this release is damaged (${image.sha256.slice(0, 12)}…). Export the release again.`);
    }
    images.set(image.sha256, new File([bytes], `${image.sha256}${EXTENSIONS[image.contentType] ?? ""}`, { type: image.contentType }));
  }
  for (const question of file.questions) {
    for (const sha of [question.images?.stem, question.images?.explanation]) {
      if (sha && !images.has(sha)) {
        throw new Error(`${question.externalKey} uses an image this file does not contain. Export the release again.`);
      }
    }
  }
  return { file, images, sizeBytes: source.size };
}

/** The image SHA-256s these questions use. */
export function imagesOf(questions: ReleaseQuestion[]): Set<string> {
  return new Set(
    questions.flatMap((q) => [q.images.stem, q.images.explanation]).filter((sha): sha is string => Boolean(sha)),
  );
}

/** The exams, subjects and topics `questions` use, as the file describes them. */
function taxonomyOf(file: ReleaseFile, questions: ReleaseQuestion[]) {
  const exams = new Set(questions.map((q) => q.examSlug));
  const subjects = new Set(questions.map((q) => q.subjectSlug));
  const topics = new Set(questions.map((q) => q.topicSlug).filter(Boolean));
  return {
    exams: file.exams.filter((e) => exams.has(e.slug)),
    subjects: file.subjects.filter((s) => subjects.has(s.slug)),
    topics: file.topics.filter((t) => topics.has(t.slug)),
  };
}

/** Preview requests: keys, hashes and images only. */
export function previewRequests(file: ReleaseFile) {
  const requests = [];
  for (let start = 0; start < file.questions.length; start += MAX_PREVIEW_QUESTIONS) {
    const questions = file.questions.slice(start, start + MAX_PREVIEW_QUESTIONS);
    const taxonomy = taxonomyOf(file, questions);
    requests.push({
      name: file.name,
      exams: taxonomy.exams.map((e) => e.slug),
      subjects: taxonomy.subjects.map((s) => s.slug),
      topics: taxonomy.topics.map((t) => ({ slug: t.slug, subjectSlug: t.subjectSlug })),
      questions: questions.map((q) => ({ externalKey: q.externalKey, contentHash: q.contentHash, images: q.images })),
    });
  }
  return requests;
}

const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Apply requests for `questions`, each under the body budget. Throws if one question alone is too big. */
export function applyRequests(file: ReleaseFile, questions: ReleaseQuestion[], overwrite: Set<string>) {
  const build = (chunk: ReleaseQuestion[]) => ({
    name: file.name,
    ...taxonomyOf(file, chunk),
    questions: chunk,
    overwrite: chunk.map((q) => q.externalKey).filter((key) => overwrite.has(key)),
  });
  const requests = [];
  let chunk: ReleaseQuestion[] = [];
  for (const question of questions) {
    if (bytesOf(build([question])) > BODY_BUDGET_BYTES) {
      throw new Error(`${question.externalKey} is too long to send in one request. Shorten its explanation or option notes.`);
    }
    if (chunk.length >= MAX_APPLY_QUESTIONS || bytesOf(build([...chunk, question])) > BODY_BUDGET_BYTES) {
      requests.push(build(chunk));
      chunk = [];
    }
    chunk.push(question);
  }
  if (chunk.length) requests.push(build(chunk));
  return requests;
}
