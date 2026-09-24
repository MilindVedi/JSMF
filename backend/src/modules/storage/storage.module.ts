import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { StorageService } from './application/storage.service';
import { StorageProvider } from './domain/storage-provider.port';
import { CloudinaryStorageAdapter } from './infrastructure/cloudinary-storage.adapter';
import { LocalStorageAdapter } from './infrastructure/local-storage.adapter';
import { LocalStorageController } from './http/local-storage.controller';

/** Present only when Cloudinary credentials are configured; null otherwise. */
const CLOUDINARY_ADAPTER = Symbol('CLOUDINARY_ADAPTER');

/**
 * Storage, assembled from configuration.
 *
 * Adding GCS or Hugging Face later means writing one class that extends
 * `StorageProvider`, adding its value to the `StorageProvider` enum and the
 * `STORAGE_DRIVER` union, and adding it to the two lists below. Nothing that
 * uploads or serves a file changes, because nothing that uploads or serves a
 * file has ever named a provider.
 */
@Module({
  controllers: [LocalStorageController],
  providers: [
    // Always constructed, even when it is not the active driver: objects
    // uploaded to disk before a provider switch must stay readable afterwards.
    LocalStorageAdapter,

    {
      provide: CLOUDINARY_ADAPTER,
      // Constructed only when credentials exist, so an unconfigured Cloudinary
      // never sits in the registry pretending to be able to serve objects.
      useFactory: (config: AppConfig): CloudinaryStorageAdapter | null =>
        config.get('CLOUDINARY_CLOUD_NAME') ? new CloudinaryStorageAdapter(config) : null,
      inject: [AppConfig],
    },

    {
      provide: StorageService,
      useFactory: (
        config: AppConfig,
        local: LocalStorageAdapter,
        cloudinaryAdapter: CloudinaryStorageAdapter | null,
      ): StorageService => {
        const candidates: (StorageProvider | null)[] = [local, cloudinaryAdapter];
        const available = candidates.filter(
          (adapter): adapter is StorageProvider => adapter !== null,
        );

        const active =
          config.get('STORAGE_DRIVER') === 'cloudinary' ? cloudinaryAdapter : local;

        if (!active) {
          // Unreachable via env validation, which already demands Cloudinary
          // credentials when that driver is selected. Kept because the failure
          // it guards — silently writing to the wrong provider — is worse than
          // a redundant check.
          throw new Error(
            'STORAGE_DRIVER=cloudinary but no Cloudinary adapter could be constructed',
          );
        }

        return new StorageService(active, available);
      },
      inject: [AppConfig, LocalStorageAdapter, CLOUDINARY_ADAPTER],
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
