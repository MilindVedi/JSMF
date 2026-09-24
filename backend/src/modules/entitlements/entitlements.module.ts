import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { DownloadService } from './application/download.service';
import { EntitlementService } from './application/entitlement.service';
import { LibraryController } from './http/library.controller';

/**
 * Who may have what.
 *
 * Kept separate from `orders` on purpose: an order is one way to acquire
 * access, not the definition of it. Admin grants, free claims, bundles and
 * future subscriptions all write entitlements without an order behind them, so
 * the module that answers "may this person download this" must not depend on
 * the module that sells things.
 */
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [LibraryController],
  providers: [EntitlementService, DownloadService],
  exports: [EntitlementService, DownloadService],
})
export class EntitlementsModule {}
