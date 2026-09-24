import { StorageProvider as StorageProviderName } from '@prisma/client';

/**
 * Whether an object is entitlement-gated or freely readable. This is the only
 * visibility vocabulary the application uses; each adapter translates it into
 * whatever its provider calls the same idea (a folder plus an access mode on
 * Cloudinary, a bucket ACL on GCS/S3, a directory on local disk).
 */
export type StorageVisibility = 'PRIVATE' | 'PUBLIC';

/**
 * The address of a stored object — provider, bucket, key. Deliberately *not* a
 * URL.
 *
 * Every column that points at a file in this system stores these three values
 * and nothing else, so a provider migration is a background job that copies
 * bytes and rewrites rows. Had we stored URLs, every historical row would embed
 * a hostname belonging to a provider we no longer use, and there would be no
 * way to tell a still-valid URL from a dead one without fetching it.
 */
export interface ObjectRef {
  provider: StorageProviderName;
  bucket: string;
  objectKey: string;
}

/**
 * Turns a stored row into an `ObjectRef`.
 *
 * Database columns are named `storage_provider` / `bucket` / `object_key` on
 * several tables (`product_assets`, and the avatar columns on `users` and
 * `publisher_profiles`). This is the one place that mapping happens, so no
 * caller has to cast — and a column rename becomes one compile error here
 * rather than a silent `undefined` provider at a call site.
 */
export function objectRefOf(row: {
  storageProvider: StorageProviderName;
  bucket: string;
  objectKey: string;
}): ObjectRef {
  return { provider: row.storageProvider, bucket: row.bucket, objectKey: row.objectKey };
}

export interface UploadRequest {
  content: Buffer;
  /** Used for the stored extension and the download filename; never trusted as a path. */
  originalFilename: string;
  mimeType: string;
  visibility: StorageVisibility;
  /**
   * Logical grouping within the bucket, e.g. `products/<productId>`. The
   * adapter appends its own unguessable component, so callers never control the
   * full key and two uploads of the same filename cannot collide.
   */
  keyPrefix?: string;
}

/**
 * Everything the caller needs to persist. The fields line up exactly with the
 * `product_assets` columns, which is the point: a successful upload hands back
 * a row rather than something that has to be reassembled.
 */
export interface StoredObject extends ObjectRef {
  sizeBytes: number;
  /** Detects a corrupted upload, and an identical re-upload. */
  checksumSha256: string;
  mimeType: string;
  originalFilename: string;
}

export interface SignedUrlOptions {
  /** Overrides the adapter default (STORAGE_SIGNED_URL_TTL_SECONDS). */
  ttlSeconds?: number;
  /** `attachment` forces a download dialog; `inline` lets a PDF open in-browser. */
  disposition?: 'inline' | 'attachment';
  /** The name the file is offered under. Cosmetic — sanitised, never a path. */
  downloadFilename?: string;
}

/**
 * The storage port.
 *
 * Application code depends on this class and never on Cloudinary, the local
 * disk, or any SDK type — so adding GCS or Hugging Face later means writing one
 * new adapter and registering it, with no change to anything that stores or
 * serves a file. Nothing here leaks a provider concept: there is no
 * `resource_type`, no bucket ACL, no SDK options bag in any signature.
 */
export abstract class StorageProvider {
  /** Recorded on every uploaded row, so an object always knows where it lives. */
  abstract readonly name: StorageProviderName;

  abstract upload(request: UploadRequest): Promise<StoredObject>;

  /**
   * A time-limited URL. Always time-limited: a link that a buyer can paste into
   * a group chat and have work forever is the failure mode this whole platform
   * has to avoid, so there is no unsigned variant of this method for private
   * objects to accidentally use.
   */
  abstract getSignedDownloadUrl(ref: ObjectRef, options?: SignedUrlOptions): Promise<string>;

  abstract delete(ref: ObjectRef): Promise<void>;

  /** False when the object is missing — used by integrity checks, not hot paths. */
  abstract exists(ref: ObjectRef): Promise<boolean>;
}
