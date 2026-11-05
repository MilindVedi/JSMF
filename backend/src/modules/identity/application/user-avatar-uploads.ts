import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf, type ObjectRef } from '../../storage/domain/storage-provider.port';
import { UploadPurposeRegistry } from '../../uploads/application/upload-purpose';

const MB = 1024 * 1024;

/** The image types a profile picture may be. Each needs a signature in domain/file-signature.ts. */
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Where a person's avatars live, under the public bucket. */
export const avatarKeyPrefix = (userId: string) => `users/${userId}/avatar`;

/** The three columns that address a stored avatar, or null when none is set. */
export function avatarRefOf(user: {
  avatarStorageProvider: string | null;
  avatarBucket: string | null;
  avatarObjectKey: string | null;
}): ObjectRef | null {
  if (!user.avatarStorageProvider || !user.avatarBucket || !user.avatarObjectKey) return null;
  return objectRefOf({
    storageProvider: user.avatarStorageProvider as Parameters<typeof objectRefOf>[0]['storageProvider'],
    bucket: user.avatarBucket,
    objectKey: user.avatarObjectKey,
  });
}

/** What `context.replaced` carries between `record` and `committed`. */
interface ReplacedAvatar {
  replaced?: { provider: string; bucket: string; objectKey: string } | null;
}

/**
 * "user.avatar": a profile picture, sent by the browser straight to object
 * storage and never through this app.
 *
 * Open to any signed-in person, which is why `prepare` is the authorisation:
 * the only account you may upload an avatar for is your own, and the key
 * prefix is derived from the *token's* user id, never from the request, so
 * there is no id to tamper with.
 *
 * PUBLIC, so the file lands in private staging, is checked there, and is
 * copied to the public bucket only once accepted — nothing unexamined is ever
 * publicly readable.
 */
@Injectable()
export class UserAvatarUploads implements OnModuleInit {
  private readonly logger = new Logger(UserAvatarUploads.name);

  constructor(
    private readonly registry: UploadPurposeRegistry,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.registry.register<Record<string, never>, { avatarUrl: string | null }>({
      key: 'user.avatar',
      // Anyone signed in; `prepare` restricts it to their own account.
      roles: [],
      visibility: 'PUBLIC',
      mimeTypes: AVATAR_MIME_TYPES,
      maxBytes: () => this.config.get('MAX_AVATAR_UPLOAD_SIZE_MB') * MB,

      // No options: an avatar is an avatar. Anything sent is ignored rather
      // than refused, so a completion that re-parses the context this purpose
      // wrote in `record` (below) still passes.
      parseContext: () => ({}) as Record<string, never>,

      prepare: async ({ targetId, actor }) => {
        if (targetId && targetId !== actor.id) {
          throw new ForbiddenException('You can only change your own profile picture.');
        }
        return { keyPrefix: avatarKeyPrefix(actor.id) };
      },

      record: async (tx, { upload, ref, actor }) => {
        const previous = await tx.user.findUniqueOrThrow({
          where: { id: actor.id },
          select: { avatarStorageProvider: true, avatarBucket: true, avatarObjectKey: true },
        });

        await tx.user.update({
          where: { id: actor.id },
          data: {
            avatarStorageProvider: ref.provider,
            avatarBucket: ref.bucket,
            avatarObjectKey: ref.objectKey,
          },
        });

        // The object this one replaces, handed to `committed` through the
        // upload's own row rather than through memory: deleting it is storage
        // work, which must not happen inside this transaction, and a field on
        // the row survives a restart and can be read by an operator asking
        // why a bucket still holds something.
        const old = avatarRefOf(previous);
        await tx.upload.update({
          where: { id: upload.id },
          data: { context: { replaced: old } as unknown as Prisma.InputJsonValue },
        });

        activity(this.logger, 'auth.avatar_updated', { userId: actor.id });
        return { id: actor.id };
      },

      committed: async ({ upload }) => {
        // Re-read: the row handed in here is the one from before `record`.
        const row = await this.prisma.upload.findUnique({
          where: { id: upload.id },
          select: { context: true },
        });
        const replaced = (row?.context as ReplacedAvatar | null)?.replaced;
        if (!replaced) return;
        // A failure here only leaves one superseded image in the bucket; it
        // must never undo an avatar the person has already been told is set.
        await this.storage
          .delete({
            provider: replaced.provider as ObjectRef['provider'],
            bucket: replaced.bucket,
            objectKey: replaced.objectKey,
          })
          .catch((error: unknown) => {
            this.logger.warn(`Could not remove the replaced avatar: ${String(error)}`);
          });
      },

      present: async (resultId) => ({ avatarUrl: await this.urlFor(resultId) }),
    });
  }

  /** A link the browser can put in an `<img>`, or null when no avatar is set. */
  async urlFor(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarStorageProvider: true, avatarBucket: true, avatarObjectKey: true },
    });
    const ref = user ? avatarRefOf(user) : null;
    return ref ? this.storage.getSignedDownloadUrl(ref, { disposition: 'inline' }) : null;
  }

  /** Forgets the current picture and removes its bytes. Safe to call with none set. */
  async remove(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarStorageProvider: true, avatarBucket: true, avatarObjectKey: true },
    });
    const ref = avatarRefOf(user);
    // The columns are cleared first: a person who asked for the picture to go
    // must not still see it because a delete failed.
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarStorageProvider: null, avatarBucket: null, avatarObjectKey: null },
    });
    activity(this.logger, 'auth.avatar_removed', { userId });
    if (ref) {
      await this.storage.delete(ref).catch((error: unknown) => {
        this.logger.warn(`Could not remove a deleted avatar's bytes: ${String(error)}`);
      });
    }
  }
}
