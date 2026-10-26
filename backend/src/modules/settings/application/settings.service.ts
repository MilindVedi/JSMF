import { BadRequestException, Injectable } from '@nestjs/common';
import { MentorCardStyle, type PlatformSettings } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { StorageService } from '../../storage/application/storage.service';
import type { ObjectRef } from '../../storage/domain/storage-provider.port';

const SINGLETON_ID = 'global';

/** What an uploaded portrait may be. The admin page checks the shape too. */
export const MENTOR_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MENTOR_PHOTO_KEY_PREFIX = 'site/mentor-photo';

/** The stored toggles — the ones an admin may change. */
export interface PlatformSettingsInput {
  showSpamFolderNote: boolean;
  mentorCardStyle: MentorCardStyle;
  /** Store buyers may download files (else read-only); a product can override it. */
  downloadsEnabled: boolean;
  /** The "Med Prep" header link to the PYQ site, on the main website and the store. */
  medPrepLinkEnabled: boolean;
  /** Whether that link wears its "New" badge. Ignored while the link is off. */
  medPrepLinkHighlight: boolean;
}

export interface PlatformSettingsDto extends PlatformSettingsInput {
  /**
   * The portrait an admin uploaded, or null for the photo bundled with each
   * website. Changed only through the upload and remove endpoints, never the
   * PATCH, so a stray URL can never be saved as the photo.
   */
  mentorPhotoUrl: string | null;
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
    private readonly storage: StorageService,
  ) {}

  /**
   * Upserts on every read so a missing row (should not happen — the migration
   * seeds it — but a hand-edited database is not impossible) heals itself
   * instead of 500ing every public page that reads this.
   */
  async get(): Promise<PlatformSettingsDto> {
    return this.toDto(await this.row());
  }

  async update(
    input: Partial<PlatformSettingsInput>,
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
      before: this.toggles(before),
      after: this.toggles(row),
      ip: actor.ip,
    });

    return this.toDto(row);
  }

  /**
   * Replaces the hero portrait. Public bucket, like a cover image: it is shown
   * to every visitor. The previous upload is deleted once the new one is saved,
   * so there is only ever one; the bundled photo is never touched.
   */
  async setMentorPhoto(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    actor: { id: string; ip?: string | null },
  ): Promise<PlatformSettingsDto> {
    if (!(MENTOR_PHOTO_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException('The portrait must be a JPEG, PNG or WebP image.');
    }
    const previous = this.photoRef(await this.row());

    const stored = await this.storage.upload({
      content: file.buffer,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      visibility: 'PUBLIC',
      keyPrefix: MENTOR_PHOTO_KEY_PREFIX,
    });
    const row = await this.prisma.platformSettings.update({
      where: { id: SINGLETON_ID },
      data: {
        mentorPhotoStorageProvider: stored.provider,
        mentorPhotoBucket: stored.bucket,
        mentorPhotoObjectKey: stored.objectKey,
      },
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: 'platform_settings.mentor_photo_uploaded',
      entityType: 'platform_settings',
      entityId: SINGLETON_ID,
      before: { objectKey: previous?.objectKey ?? null },
      after: { objectKey: stored.objectKey },
      ip: actor.ip,
    });
    if (previous) await this.deleteQuietly(previous);
    return this.toDto(row);
  }

  /** Back to the photo bundled with the websites. */
  async removeMentorPhoto(actor: { id: string; ip?: string | null }): Promise<PlatformSettingsDto> {
    const previous = this.photoRef(await this.row());
    const row = await this.prisma.platformSettings.update({
      where: { id: SINGLETON_ID },
      data: { mentorPhotoStorageProvider: null, mentorPhotoBucket: null, mentorPhotoObjectKey: null },
    });
    if (previous) {
      await this.audit.record({
        actorUserId: actor.id,
        action: 'platform_settings.mentor_photo_removed',
        entityType: 'platform_settings',
        entityId: SINGLETON_ID,
        before: { objectKey: previous.objectKey },
        after: { objectKey: null },
        ip: actor.ip,
      });
      await this.deleteQuietly(previous);
    }
    return this.toDto(row);
  }

  // --- internals ----------------------------------------------------------------

  private row() {
    return this.prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
  }

  private toggles(row: PlatformSettingsInput): PlatformSettingsInput {
    return {
      showSpamFolderNote: row.showSpamFolderNote,
      mentorCardStyle: row.mentorCardStyle,
      downloadsEnabled: row.downloadsEnabled,
      medPrepLinkEnabled: row.medPrepLinkEnabled,
      medPrepLinkHighlight: row.medPrepLinkHighlight,
    };
  }

  private async toDto(row: PlatformSettings): Promise<PlatformSettingsDto> {
    const ref = this.photoRef(row);
    return {
      ...this.toggles(row),
      mentorPhotoUrl: ref ? await this.storage.getSignedDownloadUrl(ref, { disposition: 'inline' }) : null,
    };
  }

  private photoRef(row: PlatformSettings): ObjectRef | null {
    if (!row.mentorPhotoStorageProvider || !row.mentorPhotoBucket || !row.mentorPhotoObjectKey) return null;
    return {
      provider: row.mentorPhotoStorageProvider,
      bucket: row.mentorPhotoBucket,
      objectKey: row.mentorPhotoObjectKey,
    };
  }

  /** The row is already right; an orphaned file is a cleanup problem, not the admin's. */
  private async deleteQuietly(ref: ObjectRef) {
    try {
      await this.storage.delete(ref);
    } catch {
      // Nothing to do here.
    }
  }
}
