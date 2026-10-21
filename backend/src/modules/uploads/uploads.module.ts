import { Global, Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { UploadPurposeRegistry } from './application/upload-purpose';
import { UploadService } from './application/upload.service';
import { UploadsController } from './http/uploads.controller';

/**
 * Direct-to-storage uploads for every kind of file. Global so that any module
 * owning a kind of upload can register its purpose with UploadPurposeRegistry
 * without this module ever importing it — the same one-way shape as
 * SweepRegistry.
 */
@Global()
@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
  providers: [UploadPurposeRegistry, UploadService],
  exports: [UploadPurposeRegistry],
})
export class UploadsModule {}
