import {
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StorageProvider as StorageProviderName } from '@prisma/client';
import { Storage, type Bucket } from '@google-cloud/storage';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AppConfig } from '../../../config/config.module';
import {
  ObjectRef,
  SignedUrlOptions,
  StorageProvider,
  StoredObject,
  UploadRequest,
} from '../domain/storage-provider.port';

/**
 * Google Cloud Storage.
 *
 * Two buckets rather than one with prefixes, because visibility on GCS is a
 * property of the bucket once uniform bucket-level access is on — and it should
 * be on. The alternative is per-object ACLs, where "is this PDF public?" is
 * answered object by object and one wrong write silently publishes a paid file.
 * With two buckets the private one simply has no public access to grant, so a
 * mistake in this adapter cannot expose a purchased file: the worst it can do
 * is put a cover image in the private bucket, which fails visibly instead.
 *
 * **Uses the SDK, unlike the Razorpay and Resend adapters**, which deliberately
 * speak raw HTTP. The reason is signing. A V4 signed URL is an HMAC over a
 * canonical request, and on Cloud Run there is no private key to sign with —
 * credentials are a metadata-server token, so signing has to go through the IAM
 * `signBlob` API instead. `@google-cloud/storage` handles that fallback, token
 * refresh and resumable uploads; reimplementing it would be a lot of
 * security-critical code to own for no benefit.
 */
@Injectable()
export class GcsStorageAdapter extends StorageProvider {
  readonly name = StorageProviderName.GCS;

  private readonly logger = new Logger(GcsStorageAdapter.name);
  private readonly storage: Storage;

  /**
   * Resolved once, and non-optional from here on.
   *
   * The schema marks these optional because they are meaningless under the
   * other drivers, but this adapter cannot function without them — so the
   * assertion happens at construction, where it fails at boot with a clear
   * reason, rather than at the first upload with a `undefined` bucket name.
   */
  private readonly privateBucket: string;
  private readonly publicBucket: string;

  constructor(private readonly config: AppConfig) {
    super();

    const privateBucket = this.config.get('GCS_PRIVATE_BUCKET');
    const publicBucket = this.config.get('GCS_PUBLIC_BUCKET');

    if (!privateBucket || !publicBucket) {
      throw new Error(
        'GcsStorageAdapter requires GCS_PRIVATE_BUCKET and GCS_PUBLIC_BUCKET to be set',
      );
    }

    this.privateBucket = privateBucket;
    this.publicBucket = publicBucket;

    // Application Default Credentials: the attached service account on Cloud
    // Run, GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default
    // login` locally. Deliberately no key file in configuration — a JSON key
    // that has to be stored is a long-lived credential that can leak, and on
    // Cloud Run there is a better answer that needs no secret at all.
    this.storage = new Storage({
      projectId: this.config.get('GCS_PROJECT_ID') || undefined,
    });

    this.logger.log(`GCS configured (private=${this.privateBucket}, public=${this.publicBucket})`);
  }

  async upload(request: UploadRequest): Promise<StoredObject> {
    const bucketName = this.bucketFor(request.visibility);
    const objectKey = this.buildObjectKey(request);
    const file = this.bucket(bucketName).file(objectKey);

    // Computed before the write, so a mismatch is detectable later and the
    // value stored is of the bytes we actually sent.
    const checksum = createHash('sha256').update(request.content).digest('hex');

    try {
      await file.save(request.content, {
        contentType: request.mimeType,
        // Never resumable for these sizes: a resumable session is two round
        // trips and is worth it for very large files, not for a 10MB cap.
        resumable: false,
        metadata: {
          contentType: request.mimeType,
          // Survives a provider migration and answers "what was this called
          // when it was uploaded" without a database lookup.
          metadata: { originalFilename: request.originalFilename, checksumSha256: checksum },
        },
      });
    } catch (cause) {
      throw gcsError(cause, `uploading to ${bucketName}`);
    }

    return {
      provider: this.name,
      bucket: bucketName,
      objectKey,
      sizeBytes: request.content.length,
      checksumSha256: checksum,
      mimeType: request.mimeType,
      originalFilename: request.originalFilename,
    };
  }

  /**
   * A V4 signed URL for private objects; the plain public URL for public ones.
   *
   * Public objects are not signed, deliberately. Signing a cover image would
   * produce a link that expires for no reason and defeats CDN and browser
   * caching on the busiest images in the storefront.
   */
  async getSignedDownloadUrl(ref: ObjectRef, options?: SignedUrlOptions): Promise<string> {
    if (ref.bucket === this.publicBucket) {
      return `https://storage.googleapis.com/${ref.bucket}/${encodeURI(ref.objectKey)}`;
    }

    const ttl = options?.ttlSeconds ?? this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS');
    const filename = sanitiseFilename(ref, options?.downloadFilename);

    try {
      const [url] = await this.bucket(ref.bucket)
        .file(ref.objectKey)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + ttl * 1000,
          // Set on the URL rather than the object, so the same stored file can
          // be offered inline in a preview and as a download elsewhere.
          responseDisposition:
            options?.disposition === 'inline'
              ? 'inline'
              : `attachment; filename="${filename}"`,
        });

      return url;
    } catch (cause) {
      throw gcsError(cause, `signing ${ref.bucket}/${ref.objectKey}`);
    }
  }

  async delete(ref: ObjectRef): Promise<void> {
    try {
      // Already gone is the outcome we wanted. Without this, deleting a product
      // whose file was removed by hand fails and blocks the delete forever.
      await this.bucket(ref.bucket).file(ref.objectKey).delete({ ignoreNotFound: true });
    } catch (cause) {
      throw gcsError(cause, `deleting ${ref.bucket}/${ref.objectKey}`);
    }
  }

  async exists(ref: ObjectRef): Promise<boolean> {
    try {
      const [found] = await this.bucket(ref.bucket).file(ref.objectKey).exists();
      return found;
    } catch {
      // An integrity check that throws is worse than one that reports "no":
      // callers use this to decide whether to re-upload, not to serve a request.
      return false;
    }
  }

  private bucket(name: string): Bucket {
    return this.storage.bucket(name);
  }

  private bucketFor(visibility: UploadRequest['visibility']): string {
    return visibility === 'PRIVATE' ? this.privateBucket : this.publicBucket;
  }

  /**
   * `<prefix>/<uuid><ext>` — the caller's prefix, then a component it does not
   * control.
   *
   * The original filename is never part of the key. A user-supplied name with
   * `../` in it, or one that simply collides with an existing object, must not
   * be able to steer where bytes land or overwrite someone else's file. The
   * extension is kept because it is what makes a signed URL serve the right
   * content type to a browser, and it is validated rather than trusted.
   */
  private buildObjectKey(request: UploadRequest): string {
    const extension = extname(request.originalFilename).toLowerCase().slice(0, 12);
    const safeExtension = /^\.[a-z0-9]+$/.test(extension) ? extension : '';

    return [request.keyPrefix, `${randomUUID()}${safeExtension}`].filter(Boolean).join('/');
  }
}

/** Quotes and control characters would break the Content-Disposition header. */
function sanitiseFilename(ref: ObjectRef, requested?: string): string {
  const fallback = ref.objectKey.split('/').pop() ?? 'download';
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point
  return (requested ?? fallback).replace(/[\u0000-\u001f"\\]/g, '').slice(0, 200) || 'download';
}

/**
 * Turns a GCS failure into something actionable.
 *
 * The permission cases are called out by name because they are the ones that
 * will actually happen, and because the fix is not guessable from Google's
 * wording: signing on Cloud Run needs `iam.serviceAccounts.signBlob` on the
 * service account *itself*, which is a separate grant from bucket access and
 * fails long after deployment looked successful.
 */
function gcsError(cause: unknown, context: string): Error {
  const error = cause as { code?: number | string; message?: string };
  const message = error?.message ?? String(cause);
  const code = typeof error?.code === 'number' ? error.code : undefined;

  if (code === 403 || /permission|forbidden|signBlob|iam/i.test(message)) {
    return new ServiceUnavailableException(
      `Google Cloud Storage refused the request while ${context}: ${message}. ` +
        'Check that the service account has roles/storage.objectAdmin on the bucket, and — ' +
        'for signed URLs without a key file — roles/iam.serviceAccountTokenCreator on itself.',
    );
  }

  if (code === 413) {
    return new PayloadTooLargeException(`Google Cloud Storage rejected the file: ${message}`);
  }

  if (code === 404) {
    return new ServiceUnavailableException(
      `Google Cloud Storage could not find the bucket or object while ${context}: ${message}`,
    );
  }

  return new ServiceUnavailableException(`Google Cloud Storage failed while ${context}: ${message}`);
}
