import { Module } from '@nestjs/common';
import { LegalAcceptanceService } from './application/legal-acceptance.service';
import { LegalDocumentsService } from './application/legal-documents.service';
import { LegalSeedService } from './application/legal-seed.service';
import { AdminLegalController } from './http/admin-legal.controller';
import { LegalController } from './http/legal.controller';

/** Terms, Privacy and Refund: versioned, shared by every JSMF app, and who accepted which. */
@Module({
  controllers: [LegalController, AdminLegalController],
  providers: [LegalDocumentsService, LegalAcceptanceService, LegalSeedService],
  exports: [LegalAcceptanceService],
})
export class LegalModule {}
