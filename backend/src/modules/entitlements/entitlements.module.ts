import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ContentAccessService } from './application/content-access.service';
import { EntitlementService } from './application/entitlement.service';
import { LibraryBookmarkService } from './application/library-bookmark.service';
import { ReadingProgressService } from './application/reading-progress.service';
import { LibraryController } from './http/library.controller';

/**
 * Who may have what.
 *
 * Kept separate from `orders` on purpose: an order is one way to acquire
 * access, not the definition of it. Admin grants, free claims, bundles and
 * future subscriptions all write entitlements without an order behind them, so
 * the module that answers "may this person download or read this" must not depend on
 * the module that sells things.
 */
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [LibraryController],
  providers: [EntitlementService, ContentAccessService, LibraryBookmarkService, ReadingProgressService],
  exports: [EntitlementService, ContentAccessService],
})
export class EntitlementsModule {}
