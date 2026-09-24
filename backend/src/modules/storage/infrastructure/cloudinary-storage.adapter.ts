import {
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StorageProvider as StorageProviderName } from '@prisma/client';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
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
 * How a Cloudinary object is addressed. Derived from the bucket rather than
 * stored, because the bucket already encodes visibility and a second source of
 * truth could disagree with the first.
 */
interface CloudinaryAddressing {
  resource_type: 'raw' | 'image';
  type: 'authenticated' | 'upload';
}

/**
 * Cloudinary storage.
 *
 * Private objects are uploaded as `raw` + `authenticated`: raw because a
 * purchased PDF must come back byte-identical rather than being treated as a
 * transformable image, and authenticated because such an object has no public
 * delivery URL at all — possessing the path is not possessing access. Downloads
 * go through `private_download_url`, which carries a real expiry and works
 * without the token-based-auth add-on.
 *
 * Public objects (cover images) are ordinary `image` uploads, so Cloudinary's
 * transformations remain available for thumbnails later.
 */
@Injectable()
export class CloudinaryStorageAdapter extends StorageProvider {
  readonly name = StorageProviderName.CLOUDINARY;

  private readonly logger = new Logger(CloudinaryStorageAdapter.name);

  /**
   * Configures the SDK on construction rather than in a lifecycle hook, because
   * this adapter is only constructed when credentials exist (see
   * storage.module.ts) — so an instance is always usable, and there is no window
   * in which it exists but would fail.
   */
  constructor(private readonly config: AppConfig) {
    super();

    // The SDK's default upload timeout is 60s, which a large PDF on a slow
    // uplink can exceed — and the resulting failure is indistinguishable from a
    // size rejection unless the timeout is raised deliberately.
    cloudinary.config({
      timeout: 120_000,
      cloud_name: this.config.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get('CLOUDINARY_API_KEY'),
      api_secret: this.config.get('CLOUDINARY_API_SECRET'),
      secure: true,
    });

    this.logger.log(`Cloudinary configured (cloud=${this.config.get('CLOUDINARY_CLOUD_NAME')})`);
  }

  async upload(request: UploadRequest): Promise<StoredObject> {
    const bucket = this.bucketFor(request.visibility);
    const addressing = this.addressingFor(bucket);

    const result = await new Promise<UploadApiResponse>((resolvePromise, rejectPromise) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          ...addressing,
          folder: [bucket, request.keyPrefix].filter(Boolean).join('/'),
          public_id: this.buildPublicId(request),
          // The filename is metadata, never part of the path: a user-supplied
          // name must not be able to steer where the object lands.
          use_filename: false,
          unique_filename: false,
          overwrite: false,
        },
        (error, uploaded) => {
          if (error) rejectPromise(cloudinaryError(error));
          else if (!uploaded) rejectPromise(new Error('Cloudinary returned no upload result'));
          else resolvePromise(uploaded);
        },
      );

      // Without this the SDK's default (60s) applies, and a large PDF over a
      // slow uplink fails as an opaque timeout that looks like a size limit.
      stream.on('error', (error) => rejectPromise(cloudinaryError(error)));
      stream.end(request.content);
    });

    return {
      provider: this.name,
      bucket,
      // Verbatim, including the folder and (for raw) the extension. This is the
      // exact string every other Cloudinary call takes back.
      objectKey: result.public_id,
      sizeBytes: result.bytes ?? request.content.length,
      checksumSha256: createHash('sha256').update(request.content).digest('hex'),
      mimeType: request.mimeType,
      originalFilename: request.originalFilename,
    };
  }

  getSignedDownloadUrl(ref: ObjectRef, options?: SignedUrlOptions): Promise<string> {
    const addressing = this.addressingFor(ref.bucket);

    if (addressing.type === 'upload') {
      // Public object: there is nothing to sign, and signing it would produce a
      // link that expires for no reason.
      return Promise.resolve(cloudinary.url(ref.objectKey, { ...addressing, secure: true }));
    }

    const ttl = options?.ttlSeconds ?? this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS');

    return Promise.resolve(
      cloudinary.utils.private_download_url(ref.objectKey, '', {
        resource_type: addressing.resource_type,
        type: addressing.type,
        expires_at: Math.floor(Date.now() / 1000) + ttl,
        attachment: options?.disposition !== 'inline',
      }),
    );
  }

  async delete(ref: ObjectRef): Promise<void> {
    await cloudinary.uploader.destroy(ref.objectKey, {
      ...this.addressingFor(ref.bucket),
      invalidate: true,
    });
  }

  async exists(ref: ObjectRef): Promise<boolean> {
    try {
      await cloudinary.api.resource(ref.objectKey, this.addressingFor(ref.bucket));
      return true;
    } catch {
      return false;
    }
  }

  private addressingFor(bucket: string): CloudinaryAddressing {
    return bucket === this.config.get('STORAGE_PRIVATE_BUCKET')
      ? { resource_type: 'raw', type: 'authenticated' }
      : { resource_type: 'image', type: 'upload' };
  }

  private bucketFor(visibility: UploadRequest['visibility']): string {
    return visibility === 'PRIVATE'
      ? this.config.get('STORAGE_PRIVATE_BUCKET')
      : this.config.get('STORAGE_PUBLIC_BUCKET');
  }

  /**
   * Raw objects keep their extension in the public id (Cloudinary serves them
   * back verbatim); image objects do not, because the extension there is a
   * delivery-time format rather than part of the identity.
   */
  private buildPublicId(request: UploadRequest): string {
    const id = randomUUID();

    if (request.visibility !== 'PRIVATE') return id;

    const extension = extname(request.originalFilename).toLowerCase().slice(0, 12);
    return /^\.[a-z0-9]+$/.test(extension) ? `${id}${extension}` : id;
  }
}

/**
 * Turns a Cloudinary failure into a meaningful HTTP error.
 *
 * Cloudinary reports failures as plain objects (`{ message, http_code }`), not
 * `Error` instances. Passing one to `String()` yields `"[object Object]"` —
 * which is how a rejected upload reaches an admin as a bare 500 with the actual
 * reason destroyed. Extracting the message and mapping the status means "file
 * too large" or "PDF delivery is disabled for this account" arrives as
 * something the person can act on rather than a generic failure.
 */
function cloudinaryError(error: unknown): Error {
  if (error instanceof Error) return error;

  const details = error as { message?: string; http_code?: number; name?: string };
  const message = details?.message ?? 'Cloudinary rejected the request';
  const status = details?.http_code;

  // 420 is Cloudinary's rate-limit code; 400 covers size and format rejections.
  if (status === 400 || status === 413) {
    return new PayloadTooLargeException(`Cloudinary rejected the file: ${message}`);
  }
  if (status === 401 || status === 403) {
    return new ServiceUnavailableException(
      `Cloudinary refused the request (${message}). If this is a PDF, check that ` +
        '"PDF and ZIP files delivery" is enabled under Settings → Security.',
    );
  }

  return new ServiceUnavailableException(`Cloudinary upload failed: ${message}`);
}
