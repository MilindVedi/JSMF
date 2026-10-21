import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { StorageProvider as StorageProviderName } from '@prisma/client';
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

/**
 * The façade every other module injects. Nothing outside this module injects a
 * concrete adapter.
 *
 * Its one real job is the asymmetry between writing and reading:
 *
 * - **Writes** go to the *currently configured* provider.
 * - **Reads, deletes and existence checks** go to the provider that the object
 *   itself records.
 *
 * That distinction is what makes switching providers a background migration
 * rather than a flag day. Flipping STORAGE_DRIVER to `cloudinary` sends new
 * uploads to Cloudinary while every file already on local disk keeps being
 * served from local disk, because each row knows where its bytes actually are.
 * Had reads used the configured driver, that same flip would have made every
 * existing asset a 404 — the schema comment on `product_assets.storage_provider`
 * says exactly this, and this class is where it is enforced.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly adapters = new Map<StorageProviderName, StorageProvider>();

  constructor(
    private readonly defaultAdapter: StorageProvider,
    availableAdapters: StorageProvider[],
  ) {
    for (const adapter of availableAdapters) {
      this.adapters.set(adapter.name, adapter);
    }

    this.logger.log(
      `writes → ${defaultAdapter.name}; can read from [${[...this.adapters.keys()].join(', ')}]`,
    );
  }

  /** The provider new uploads are written to. */
  get activeProvider(): StorageProviderName {
    return this.defaultAdapter.name;
  }

  upload(request: UploadRequest): Promise<StoredObject> {
    return this.defaultAdapter.upload(request);
  }

  getSignedDownloadUrl(ref: ObjectRef, options?: SignedUrlOptions): Promise<string> {
    return this.adapterFor(ref).getSignedDownloadUrl(ref, options);
  }

  delete(ref: ObjectRef): Promise<void> {
    return this.adapterFor(ref).delete(ref);
  }

  exists(ref: ObjectRef): Promise<boolean> {
    return this.adapterFor(ref).exists(ref);
  }

  /** Whether new files can go straight from the browser to the active provider. */
  get supportsDirectUpload(): boolean {
    const adapter = this.defaultAdapter;
    return Boolean(adapter.createDirectUpload && adapter.stat && adapter.readRange && adapter.copy);
  }

  /** Like `upload`, to the active provider — but the browser sends the bytes. */
  createDirectUpload(request: DirectUploadRequest): Promise<DirectUploadSession> {
    const adapter = this.defaultAdapter;
    if (!adapter.createDirectUpload) {
      throw new ServiceUnavailableException(`Storage provider ${adapter.name} does not support direct uploads.`);
    }
    return adapter.createDirectUpload(request);
  }

  stat(ref: ObjectRef): Promise<StoredObjectInfo | null> {
    const adapter = this.adapterFor(ref);
    if (!adapter.stat) {
      throw new ServiceUnavailableException(`Storage provider ${adapter.name} cannot describe stored objects.`);
    }
    return adapter.stat(ref);
  }

  copy(from: ObjectRef, to: CopyRequest): Promise<ObjectRef> {
    const adapter = this.adapterFor(from);
    if (!adapter.copy) {
      throw new ServiceUnavailableException(`Storage provider ${adapter.name} cannot copy objects.`);
    }
    return adapter.copy(from, to);
  }

  readRange(ref: ObjectRef, start: number, end: number): Promise<Buffer> {
    const adapter = this.adapterFor(ref);
    if (!adapter.readRange) {
      throw new ServiceUnavailableException(`Storage provider ${adapter.name} cannot read part of an object.`);
    }
    return adapter.readRange(ref, start, end);
  }

  /**
   * A 503 rather than a 500: an asset stored on GCS with no GCS adapter
   * compiled in is a deployment gap, not a bug in the request. The message says
   * which provider is missing so the fix is obvious from the log line alone.
   */
  private adapterFor(ref: ObjectRef): StorageProvider {
    const adapter = this.adapters.get(ref.provider);

    if (!adapter) {
      throw new ServiceUnavailableException(
        `No storage adapter is registered for provider ${ref.provider}, ` +
          `which object ${ref.bucket}/${ref.objectKey} is stored on.`,
      );
    }

    return adapter;
  }
}
