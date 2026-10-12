import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { LegalChangeKind, LegalDocumentType, LegalVersionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { INITIAL_DOCUMENTS } from '../domain/initial-documents';
import { contentHash } from '../domain/legal-document';
import { LegalDocumentsService } from './legal-documents.service';

/**
 * Publishes version 1.0 of any document type that has no version at all, so a
 * fresh database — and this first deployment — has Terms, Privacy and Refund
 * to show without anyone typing them in. Never touches a type that already
 * has a version: from then on the admin panel owns the text.
 */
@Injectable()
export class LegalSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegalSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: LegalDocumentsService,
  ) {}

  async onApplicationBootstrap() {
    const existing = await this.prisma.legalDocumentVersion.groupBy({ by: ['type'] });
    const missing = Object.values(LegalDocumentType).filter((t) => !existing.some((e) => e.type === t));
    if (missing.length === 0) return;

    const now = new Date();
    for (const type of missing) {
      const { title, sections } = INITIAL_DOCUMENTS[type];
      try {
        await this.prisma.legalDocumentVersion.create({
          data: {
            type,
            status: LegalVersionStatus.PUBLISHED,
            version: '1.0',
            title,
            sections: sections as unknown as Prisma.InputJsonValue,
            contentHash: contentHash(title, sections),
            changeKind: LegalChangeKind.MAJOR,
            changeSummary: 'Initial version.',
            effectiveAt: now,
            publishedAt: now,
          },
        });
        this.logger.log(`Published ${type} 1.0`);
      } catch (error) {
        // Another instance booting at the same moment got there first.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    await this.documents.invalidate();
  }
}
