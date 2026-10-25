import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, Upload, UploadStatus } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SweepRegistry } from '../../../shared/scheduling/sweep-registry';
import { StorageService } from '../../storage/application/storage.service';
import { objectRefOf, type ObjectRef } from '../../storage/domain/storage-provider.port';
import { matchesSignature, SIGNATURE_BYTES } from '../domain/file-signature';
import {
  mayUse,
  UploadPurposeRegistry,
  type UploadActor,
  type UploadPurpose,
  type UploadRefusal,
} from './upload-purpose';

const MB = 1024 * 1024;

/** Unfinished uploads one person may have open at once — a bound on abandoned sessions, not on real work. */
const MAX_OPEN_UPLOADS_PER_USER = 20;

/**
 * How long after giving up on an upload the sweep keeps deleting its object.
 * A GCS session lives a week, so a browser that kept sending after this app
 * gave up could still finish one that long after; a day's margin on top.
 */
const LATE_FINISH_WINDOW_MS = 8 * 24 * 3600 * 1000;

export interface StartUploadInput {
  purpose: string;
  targetId: string | null;
  context: unknown;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** The Origin header of the request, when it sent one. */
  origin: string | undefined;
}

/**
 * Files a browser sends straight to object storage, for any purpose. The app
 * hands out a session, never touches the bytes, and lets the purpose record
 * the file only after checking what actually arrived — the same shape as a
 * download, where the app checks access and the file comes from storage.
 *
 * 1. `start` asks the purpose whether this person may upload this file here,
 *    chooses the object key, opens a storage session locked to that key and
 *    exact size (the provider refuses anything else), and records the attempt
 *    as PENDING. A file bound for the public bucket is sent to a private
 *    staging key instead.
 * 2. The browser sends the file in pieces to the session URL.
 * 3. `complete` reads the object's metadata — size, type, MD5 — and its first
 *    bytes for the format, lets the purpose take a last look, copies a staged
 *    file out to its public home, and has the purpose record it in the same
 *    transaction that marks the upload COMPLETED.
 *
 * Anything refused at step 3 is deleted at once. Anything never completed is
 * deleted by the sweep once its row expires.
 */
@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly purposes: UploadPurposeRegistry,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly sweeps: SweepRegistry,
  ) {}

  onModuleInit(): void {
    this.sweeps.register({ name: 'uploads', run: () => this.sweep() });
  }

  /** What this person's browser needs to choose a path and say the limits. */
  options(actor: Pick<UploadActor, 'roles'>) {
    return {
      direct: this.storage.supportsDirectUpload,
      chunkSizeBytes: this.config.get('DIRECT_UPLOAD_CHUNK_MB') * MB,
      /** For the multipart fallback, used when `direct` is false. */
      maxMultipartBytes: this.config.get('MAX_UPLOAD_SIZE_MB') * MB,
      purposes: Object.fromEntries(
        this.purposes
          .all()
          .filter((purpose) => mayUse(purpose, actor))
          .map((purpose) => [purpose.key, { maxBytes: purpose.maxBytes(), mimeTypes: [...purpose.mimeTypes] }]),
      ),
    };
  }

  async start(input: StartUploadInput, actor: UploadActor) {
    if (!this.storage.supportsDirectUpload) {
      throw new BadRequestException('Direct uploads are not available with this storage provider.');
    }
    const purpose = this.purposeFor(input.purpose, actor);

    if (!purpose.mimeTypes.includes(input.mimeType)) {
      throw new BadRequestException(`This upload must be one of: ${purpose.mimeTypes.join(', ')} (not ${input.mimeType}).`);
    }
    if (input.sizeBytes <= 0) throw new BadRequestException('The file is empty.');
    if (input.sizeBytes > purpose.maxBytes()) {
      throw new BadRequestException(
        `The file is ${(input.sizeBytes / MB).toFixed(1)} MB; the limit is ${Math.round(purpose.maxBytes() / MB)} MB.`,
      );
    }

    const context = purpose.parseContext(input.context);
    const { keyPrefix } = await purpose.prepare({ targetId: input.targetId, context, actor });

    const open = await this.prisma.upload.count({
      where: { createdById: actor.id, status: UploadStatus.PENDING, expiresAt: { gt: new Date() } },
    });
    if (open >= MAX_OPEN_UPLOADS_PER_USER) {
      throw new ConflictException(
        `You have ${open} unfinished uploads. Finish or cancel some, or wait for them to expire.`,
      );
    }

    const originalFilename = cleanFilename(input.filename);
    // A public file is checked where nobody can read it, then copied out.
    const staged = purpose.visibility === 'PUBLIC';
    const session = await this.storage.createDirectUpload({
      visibility: 'PRIVATE',
      keyPrefix: staged ? `staging/${purpose.key}` : keyPrefix,
      originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      origin: this.uploadOrigin(input.origin),
    });

    const expiresAt = new Date(Date.now() + this.config.get('DIRECT_UPLOAD_EXPIRY_HOURS') * 3600_000);
    const upload = await this.prisma.upload.create({
      data: {
        purpose: purpose.key,
        targetId: input.targetId,
        context: context === undefined || context === null ? Prisma.JsonNull : (context as Prisma.InputJsonValue),
        storageProvider: session.ref.provider,
        bucket: session.ref.bucket,
        objectKey: session.ref.objectKey,
        staged,
        originalFilename,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        expiresAt,
        createdById: actor.id,
      },
    });

    return {
      uploadId: upload.id,
      // The session URL is the credential for this one object. It goes to the
      // uploader's browser and is never stored or logged here.
      uploadUrl: session.uploadUrl,
      sizeBytes: input.sizeBytes,
      chunkSizeBytes: this.config.get('DIRECT_UPLOAD_CHUNK_MB') * MB,
      expiresAt,
    };
  }

  /**
   * Checks what arrived and hands it to the purpose. Safe to call again: a
   * completed upload returns what it already became.
   */
  async complete(uploadId: string, actor: UploadActor): Promise<unknown> {
    const upload = await this.ownUpload(uploadId, actor);
    const purpose = this.purposes.get(upload.purpose);

    if (upload.status === UploadStatus.COMPLETED && upload.resultId) return purpose.present(upload.resultId);
    if (upload.status !== UploadStatus.PENDING) {
      throw new GoneException(
        upload.failureReason ?? 'This upload was cancelled or expired. Choose the file again to upload it.',
      );
    }
    if (upload.expiresAt <= new Date()) {
      await this.finish(upload, UploadStatus.EXPIRED, 'It was not finished in time.');
      throw new GoneException('This upload expired before it was finished. Choose the file again to upload it.');
    }

    const sent = objectRefOf(upload);
    const info = await this.storage.stat(sent);
    // Left PENDING: the last piece may simply still be on its way.
    if (!info) throw new ConflictException('The file has not finished uploading yet.');

    const declared = Number(upload.sizeBytes);
    if (info.sizeBytes !== declared) {
      return this.refuse(upload, { message: `The file that arrived is ${info.sizeBytes} bytes, not the ${declared} declared.` });
    }
    if (info.mimeType && info.mimeType !== upload.mimeType) {
      return this.refuse(upload, { message: `The file arrived as ${info.mimeType}, not ${upload.mimeType}.` });
    }
    if (!matchesSignature(upload.mimeType, await this.storage.readRange(sent, 0, SIGNATURE_BYTES - 1))) {
      return this.refuse(upload, {
        message:
          upload.mimeType === 'application/pdf'
            ? 'That file is not a PDF, though its name says it is. Export it as a PDF and upload it again.'
            : `That file is not really ${upload.mimeType}. Save it again in that format and upload it.`,
      });
    }

    const context = purpose.parseContext(upload.context ?? undefined);
    // Again: the target may have gone, or this person's rights with it.
    const { keyPrefix } = await purpose.prepare({ targetId: upload.targetId, context, actor });
    const refusal = await purpose.inspect?.({ upload, context, info });
    if (refusal) return this.refuse(upload, refusal);

    // Copied inside the provider: the bytes never come through this app.
    const ref: ObjectRef = upload.staged
      ? await this.storage.copy(sent, { visibility: purpose.visibility, keyPrefix, originalFilename: upload.originalFilename })
      : sent;

    let resultId: string;
    try {
      resultId = await this.prisma.$transaction(async (tx) => {
        // Claimed inside the transaction: of two completions racing, one wins
        // this update and the other rolls back without having written anything.
        const claimed = await tx.upload.updateMany({
          where: { id: upload.id, status: UploadStatus.PENDING },
          data: { status: UploadStatus.COMPLETED, finishedAt: new Date() },
        });
        if (claimed.count === 0) throw new ConflictException('This upload is already being completed.');

        const result = await purpose.record(tx, { upload, context, ref, info, actor });
        await tx.upload.update({ where: { id: upload.id }, data: { resultId: result.id } });
        return result.id;
      });
    } catch (error) {
      // The staged original stays, so completing again can copy it afresh.
      if (upload.staged) await this.deleteQuietly(ref);
      throw error;
    }

    if (upload.staged) await this.deleteQuietly(sent);
    this.logger.log(`Upload ${upload.id} (${upload.purpose}) recorded as ${resultId}, ${info.sizeBytes} bytes`);
    await purpose.committed?.({ resultId, upload, actor }).catch((error: unknown) => {
      this.logger.error(`After upload ${upload.id} (${upload.purpose}) was recorded: ${String(error)}`);
    });
    return purpose.present(resultId);
  }

  /** The uploader gave up. Whatever reached storage is removed. */
  async abort(uploadId: string, actor: UploadActor): Promise<void> {
    const upload = await this.ownUpload(uploadId, actor);
    if (upload.status !== UploadStatus.PENDING) return;
    await this.finish(upload, UploadStatus.ABORTED, 'Cancelled.');
  }

  /**
   * Every 5 minutes: expire what was never completed, and keep deleting what a
   * given-up session could still finish, and any staged original a completion
   * left behind. Each delete is idempotent, and never touches an object a
   * completed, unstaged upload became.
   */
  async sweep() {
    const now = new Date();
    const expired = await this.prisma.upload.findMany({
      where: { status: UploadStatus.PENDING, expiresAt: { lte: now } },
      take: 200,
    });
    for (const upload of expired) await this.finish(upload, UploadStatus.EXPIRED, 'It was not finished in time.');

    const leftovers = await this.prisma.upload.findMany({
      where: {
        finishedAt: { gt: new Date(now.getTime() - LATE_FINISH_WINDOW_MS) },
        OR: [
          { status: { in: [UploadStatus.ABORTED, UploadStatus.EXPIRED] } },
          { status: UploadStatus.COMPLETED, staged: true },
        ],
      },
      take: 500,
    });
    let removed = 0;
    for (const upload of leftovers) if (await this.deleteQuietly(objectRefOf(upload))) removed += 1;

    return { expired: expired.length, checked: leftovers.length, removed };
  }

  // --- internals ----------------------------------------------------------------

  private purposeFor(key: string, actor: UploadActor): UploadPurpose {
    const purpose = this.purposes.get(key);
    if (!mayUse(purpose, actor)) throw new ForbiddenException('You cannot upload this kind of file.');
    return purpose;
  }

  private async ownUpload(uploadId: string, actor: UploadActor): Promise<Upload> {
    const upload = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) throw new NotFoundException('Upload not found');
    // The session was handed to one person's browser; nobody else completes it.
    if (upload.createdById !== actor.id) throw new ForbiddenException('This upload was started by someone else.');
    return upload;
  }

  /** Refuses at completion: recorded, the object deleted, the reason thrown to the uploader. */
  private async refuse(upload: Upload, refusal: UploadRefusal): Promise<never> {
    await this.finish(upload, UploadStatus.ABORTED, refusal.message);
    await this.audit.record({
      actorUserId: upload.createdById,
      action: 'upload.refused',
      entityType: 'upload',
      entityId: upload.id,
      after: { purpose: upload.purpose, targetId: upload.targetId, reason: refusal.message },
    });
    throw refusal.status === 409 ? new ConflictException(refusal.message) : new BadRequestException(refusal.message);
  }

  /** Moves a PENDING upload to a final state and removes its object. */
  private async finish(upload: Upload, status: UploadStatus, reason: string): Promise<void> {
    const moved = await this.prisma.upload.updateMany({
      where: { id: upload.id, status: UploadStatus.PENDING },
      data: { status, failureReason: reason.slice(0, 300), finishedAt: new Date() },
    });
    if (moved.count > 0) await this.deleteQuietly(objectRefOf(upload));
  }

  /** True when a delete was sent. A failure is logged: the sweep comes back to it. */
  private async deleteQuietly(ref: ObjectRef): Promise<boolean> {
    try {
      await this.storage.delete(ref);
      return true;
    } catch (cause) {
      this.logger.warn(`Could not remove ${ref.bucket}/${ref.objectKey}: ${String(cause)}`);
      return false;
    }
  }

  /**
   * The web origin the storage session will answer CORS for. The request's
   * own Origin when it is one this API already trusts, else the store's: the
   * admin panel is served from it.
   */
  private uploadOrigin(requested: string | undefined): string {
    const trusted = this.config.get('CORS_ORIGINS');
    if (requested && trusted.includes(requested)) return requested;
    return new URL(this.config.get('STOREFRONT_URL')).origin;
  }
}

/** A display name only, kept for version lists and download filenames. */
function cleanFilename(name: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are what is being removed
  const cleaned = name.replace(/[\u0000-\u001f\\/]/g, '').trim().slice(0, 255);
  return cleaned || 'upload';
}
