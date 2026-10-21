import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider as StorageProviderName } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, constants, copyFile, mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { AppConfig } from '../../../config/config.module';
import {
  CopyRequest,
  DirectUploadRequest,
  DirectUploadSession,
  ObjectRef,
  SignedUrlOptions,
  StorageProvider,
  StoredObject,
  StoredObjectInfo,
  UploadRequest,
} from '../domain/storage-provider.port';

/** What a valid signature grants access to, and until when. */
export interface LocalDownloadGrant {
  bucket: string;
  objectKey: string;
  expiresAt: number;
}

/** What a signed upload URL lets the browser write: one object, of one size and type, until a time. */
export interface LocalUploadGrant {
  bucket: string;
  objectKey: string;
  sizeBytes: number;
  mimeType: string;
  expiresAt: number;
}

/**
 * The outcome of one `PUT` to a local upload session, in GCS's terms: `308`
 * with how many bytes are stored so far, `200` once the last one arrives.
 */
export type LocalUploadResult =
  | { status: 200; sizeBytes: number }
  | { status: 308; storedBytes: number }
  | { status: 400 | 412; message: string };

/** How long a local upload session stays valid: a week, as on GCS. */
const LOCAL_UPLOAD_TTL_SECONDS = 7 * 24 * 3600;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

/**
 * Local-disk storage for development.
 *
 * It is not a mock: files are really written, links really expire, and a
 * tampered signature really fails. The whole upload → entitlement →
 * time-limited download path can therefore be built and tested before any
 * Cloudinary account exists, and switching to Cloudinary later exercises code
 * that was already proven against a working implementation rather than against
 * a stub that always said yes.
 *
 * Env validation refuses to boot production with this driver selected.
 */
@Injectable()
export class LocalStorageAdapter extends StorageProvider {
  readonly name = StorageProviderName.LOCAL;

  private readonly logger = new Logger(LocalStorageAdapter.name);
  private readonly root: string;

  constructor(private readonly config: AppConfig) {
    super();
    this.root = resolve(process.cwd(), this.config.get('STORAGE_LOCAL_ROOT'));
  }

  async upload(request: UploadRequest): Promise<StoredObject> {
    const bucket = this.bucketFor(request.visibility);
    const objectKey = this.buildObjectKey(request);
    const path = this.resolveWithinRoot(bucket, objectKey);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, request.content);

    this.logger.debug(`stored ${bucket}/${objectKey} (${request.content.length} bytes)`);

    return {
      provider: this.name,
      bucket,
      objectKey,
      sizeBytes: request.content.length,
      checksumSha256: createHash('sha256').update(request.content).digest('hex'),
      checksumMd5: createHash('md5').update(request.content).digest('hex'),
      mimeType: request.mimeType,
      originalFilename: request.originalFilename,
    };
  }

  /**
   * Points at this API's own download route. The signature — not the session —
   * is what authorises the fetch, which is exactly how a cloud provider's signed
   * URL behaves, so callers cannot come to depend on a cookie being present.
   */
  getSignedDownloadUrl(ref: ObjectRef, options?: SignedUrlOptions): Promise<string> {
    const ttl = options?.ttlSeconds ?? this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS');
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;

    const params = new URLSearchParams({
      bucket: ref.bucket,
      key: ref.objectKey,
      expires: String(expiresAt),
      signature: this.sign({ bucket: ref.bucket, objectKey: ref.objectKey, expiresAt }),
    });

    if (options?.disposition) params.set('disposition', options.disposition);
    if (options?.downloadFilename) params.set('filename', options.downloadFilename);

    const base = this.config.get('APP_PUBLIC_URL').replace(/\/+$/, '');
    return Promise.resolve(`${base}/storage/local/download?${params.toString()}`);
  }

  async delete(ref: ObjectRef): Promise<void> {
    await rm(this.resolveWithinRoot(ref.bucket, ref.objectKey), { force: true });
  }

  async exists(ref: ObjectRef): Promise<boolean> {
    try {
      await stat(this.resolveWithinRoot(ref.bucket, ref.objectKey));
      return true;
    } catch {
      return false;
    }
  }

  // --- direct uploads -------------------------------------------------------
  //
  // The same resumable protocol as GCS, served by this API's own
  // LocalStorageController, so the browser's upload client and the whole
  // start -> send -> complete flow run unchanged without a cloud bucket. The
  // signed token in the URL is the credential, as GCS's session URL is.

  createDirectUpload(request: DirectUploadRequest): Promise<DirectUploadSession> {
    const bucket = this.bucketFor(request.visibility);
    const objectKey = this.buildObjectKey(request);
    const token = this.signUploadToken({
      bucket,
      objectKey,
      sizeBytes: request.sizeBytes,
      mimeType: request.mimeType,
      expiresAt: Math.floor(Date.now() / 1000) + LOCAL_UPLOAD_TTL_SECONDS,
    });
    const base = this.config.get('APP_PUBLIC_URL').replace(/\/+$/, '');
    return Promise.resolve({
      ref: { provider: this.name, bucket, objectKey },
      uploadUrl: `${base}/storage/local/uploads/${token}`,
    });
  }

  async stat(ref: ObjectRef): Promise<StoredObjectInfo | null> {
    const path = this.resolveWithinRoot(ref.bucket, ref.objectKey);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return null;

    // Read through once, as a provider would have while storing it. Local
    // files are development-sized; this is never a production path.
    const md5 = createHash('md5');
    for await (const piece of createReadStream(path)) md5.update(piece as Buffer);

    return {
      sizeBytes: info.size,
      mimeType: MIME_BY_EXTENSION[extname(ref.objectKey).toLowerCase()] ?? null,
      md5: md5.digest('hex'),
    };
  }

  async readRange(ref: ObjectRef, start: number, end: number): Promise<Buffer> {
    const handle = await open(this.resolveWithinRoot(ref.bucket, ref.objectKey), 'r');
    try {
      const buffer = Buffer.alloc(end - start + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async copy(from: ObjectRef, to: CopyRequest): Promise<ObjectRef> {
    const bucket = this.bucketFor(to.visibility);
    const objectKey = this.buildObjectKey(to);
    const target = this.resolveWithinRoot(bucket, objectKey);
    await mkdir(dirname(target), { recursive: true });
    // Never over an existing file, as `ifGenerationMatch: 0` on GCS.
    await copyFile(this.resolveWithinRoot(from.bucket, from.objectKey), target, constants.COPYFILE_EXCL);
    return { provider: this.name, bucket, objectKey };
  }

  signUploadToken(grant: LocalUploadGrant): string {
    const payload = Buffer.from(
      JSON.stringify([grant.bucket, grant.objectKey, grant.sizeBytes, grant.mimeType, grant.expiresAt]),
    ).toString('base64url');
    return `${payload}.${this.uploadSignature(payload)}`;
  }

  /** The grant a token carries, or null when it is forged, malformed or expired. */
  verifyUploadToken(token: string): LocalUploadGrant | null {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const expected = Buffer.from(this.uploadSignature(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    try {
      const [bucket, objectKey, sizeBytes, mimeType, expiresAt] = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as [string, string, number, string, number];
      if (expiresAt < Math.floor(Date.now() / 1000)) return null;
      return { bucket, objectKey, sizeBytes, mimeType, expiresAt };
    } catch {
      return null;
    }
  }

  /**
   * One `PUT` to a session. `contentRange` is the request's header: either
   * `bytes <first>-<last>/<total>` with that piece as the body, or
   * the same with an asterisk in place of the range, asking how much is stored. Pieces are appended to a
   * `.part` file that becomes the object only once complete, so a half-sent
   * file is never readable as the object.
   */
  async receiveUpload(
    grant: LocalUploadGrant,
    contentRange: string | undefined,
    body: AsyncIterable<Buffer>,
  ): Promise<LocalUploadResult> {
    const finalPath = this.resolveWithinRoot(grant.bucket, grant.objectKey);
    const partPath = `${finalPath}.part`;

    const match = /^bytes (?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(contentRange?.trim() ?? '');
    if (!match) return { status: 400, message: 'A Content-Range header is required.' };
    const total = Number(match[3]);
    if (total !== grant.sizeBytes) {
      return {
        status: 400,
        message:
          `According to the Content-Range header, the final size of the upload is ${total} byte(s). ` +
          `This does not match the expected size of ${grant.sizeBytes} byte(s).`,
      };
    }

    const done = await stat(finalPath).catch(() => null);
    const stored = (await stat(partPath).catch(() => null))?.size ?? 0;

    // A status query.
    if (match[1] === undefined) {
      if (done) return { status: 200, sizeBytes: done.size };
      return { status: 308, storedBytes: stored };
    }

    // Never over an existing object, as `ifGenerationMatch: 0` on GCS.
    if (done) return { status: 412, message: 'The object already exists.' };

    const first = Number(match[1]);
    const last = Number(match[2]);
    if (last < first || last >= total) return { status: 400, message: 'The Content-Range is invalid.' };
    if (first > stored) {
      return { status: 400, message: `Expected the next piece to start at byte ${stored}, not ${first}.` };
    }

    // Bytes already stored are skipped, so resending an overlapping piece after
    // a dropped connection is harmless: the same rule GCS applies.
    await mkdir(dirname(partPath), { recursive: true });
    let position = first;
    const expectedEnd = last + 1;
    for await (const piece of body) {
      if (position >= expectedEnd) break;
      const usable = piece.subarray(0, expectedEnd - position);
      const skip = Math.max(0, stored - position);
      if (skip < usable.length) await appendFile(partPath, usable.subarray(skip));
      position += usable.length;
    }

    const nowStored = (await stat(partPath).catch(() => null))?.size ?? 0;
    if (nowStored === total) {
      await rename(partPath, finalPath);
      return { status: 200, sizeBytes: total };
    }
    return { status: 308, storedBytes: nowStored };
  }

  /** Cancels a session: whatever arrived of it is removed. */
  async cancelUpload(grant: LocalUploadGrant): Promise<void> {
    await rm(`${this.resolveWithinRoot(grant.bucket, grant.objectKey)}.part`, { force: true });
  }

  private uploadSignature(payload: string): string {
    // Its own purpose label, so an upload token can never pass as a download
    // signature or the other way round, though both use the same secret.
    return createHmac('sha256', this.config.get('STORAGE_SIGNING_SECRET'))
      .update(`direct-upload\n${payload}`)
      .digest('base64url');
  }

  // --- signing ------------------------------------------------------------

  sign(grant: LocalDownloadGrant): string {
    // The separator is a character that cannot appear in a bucket or key, so
    // distinct grants cannot produce the same signing input. Without that,
    // bucket "a/b" + key "c" and bucket "a" + key "b/c" would sign identically.
    return createHmac('sha256', this.config.get('STORAGE_SIGNING_SECRET'))
      .update(`${grant.bucket}\n${grant.objectKey}\n${grant.expiresAt}`)
      .digest('base64url');
  }

  verifySignature(grant: LocalDownloadGrant, signature: string): boolean {
    const expected = Buffer.from(this.sign(grant));
    const actual = Buffer.from(signature);

    // Length must be checked separately: timingSafeEqual throws on a mismatch
    // rather than returning false.
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  // --- paths --------------------------------------------------------------

  /**
   * Resolves under the storage root and proves it stayed there.
   *
   * Keys are generated by this adapter, but on the download path they arrive
   * from a URL. A signature check alone would not help if the signed key itself
   * contained `../` — so containment is enforced structurally here, at the only
   * place that turns a key into a filesystem path.
   */
  resolveWithinRoot(bucket: string, objectKey: string): string {
    const path = resolve(join(this.root, bucket, objectKey));

    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new Error('Resolved storage path escapes the storage root');
    }

    return path;
  }

  private bucketFor(visibility: UploadRequest['visibility']): string {
    return visibility === 'PRIVATE'
      ? this.config.get('STORAGE_PRIVATE_BUCKET')
      : this.config.get('STORAGE_PUBLIC_BUCKET');
  }

  /**
   * `<prefix>/<uuid><ext>` — the caller supplies grouping, never the whole key.
   * The UUID makes the key unguessable and collision-free; the original filename
   * is metadata, not part of the path, so a user-supplied name can never steer
   * where bytes land.
   */
  private buildObjectKey(request: Pick<UploadRequest, 'originalFilename' | 'keyPrefix'>): string {
    const extension = extname(request.originalFilename).toLowerCase().slice(0, 12);
    const prefix = (request.keyPrefix ?? '')
      .split('/')
      .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, ''))
      .filter(Boolean)
      .join('/');

    const name = `${randomUUID()}${/^\.[a-z0-9]+$/.test(extension) ? extension : ''}`;
    return prefix ? `${prefix}/${name}` : name;
  }
}
