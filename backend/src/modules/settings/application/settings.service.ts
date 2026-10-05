import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';

const SINGLETON_ID = 'global';

export interface PlatformSettingsDto {
  showSpamFolderNote: boolean;
}

/**
 * Site-wide toggles that are not tied to any one session or product.
 *
 * Backed by one fixed row rather than a key/value table — there are only a
 * handful of these, each with its own type, and a row per toggle would just
 * move the "does it exist yet" problem into every reader instead of here.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Upserts on every read so a missing row (should not happen — the migration
   * seeds it — but a hand-edited database is not impossible) heals itself
   * instead of 500ing every public page that reads this.
   */
  async get(): Promise<PlatformSettingsDto> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });

    return { showSpamFolderNote: row.showSpamFolderNote };
  }

  async update(
    input: Partial<PlatformSettingsDto>,
    actor: { id: string; ip?: string | null },
  ): Promise<PlatformSettingsDto> {
    const before = await this.get();

    const row = await this.prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...input },
      update: input,
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: 'platform_settings.updated',
      entityType: 'platform_settings',
      entityId: SINGLETON_ID,
      before,
      after: { showSpamFolderNote: row.showSpamFolderNote },
      ip: actor.ip,
    });

    return { showSpamFolderNote: row.showSpamFolderNote };
  }
}
