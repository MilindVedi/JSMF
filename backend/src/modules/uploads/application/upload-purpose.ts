import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, Upload } from '@prisma/client';
import type {
  ObjectRef,
  StorageVisibility,
  StoredObjectInfo,
} from '../../storage/domain/storage-provider.port';

/** Who is uploading: enough to authorise, attribute and audit. */
export interface UploadActor {
  id: string;
  ip?: string | null;
  roles: string[];
}

/** Why an arrived file was not accepted. The file is deleted; the message goes to the uploader. */
export interface UploadRefusal {
  message: string;
  /** 409 when the file is fine but changes nothing (an identical re-upload). Default 400. */
  status?: 400 | 409;
}

/**
 * One kind of upload — what a file is for, and everything that differs
 * between kinds. UploadService runs the same start → send → complete flow for
 * all of them and asks the purpose at each step; the module that owns the
 * thing being uploaded to (catalog for product files, events for session
 * screenshots, identity later for avatars) registers its purposes at startup,
 * so this module never imports any of them.
 *
 * Adding a kind of upload is one class implementing this: no new table, no new
 * endpoint, no new browser client.
 */
export interface UploadPurpose<TContext = unknown, TResult = unknown> {
  /** Stable, dotted: "product.primary_file". Stored on every upload row. */
  readonly key: string;
  /**
   * Roles of which the uploader needs one. Empty means any signed-in person,
   * and `prepare` decides (an avatar: only for yourself).
   */
  readonly roles: readonly string[];
  /**
   * Where the accepted file lives. A PUBLIC one is uploaded to private
   * staging and copied out only once accepted, so nothing unchecked is ever
   * publicly readable.
   */
  readonly visibility: StorageVisibility;
  /** Accepted types. Each must have a signature in domain/file-signature.ts. */
  readonly mimeTypes: readonly string[];
  /** The largest file accepted, in bytes. */
  maxBytes(): number;
  /** Validates the purpose's own options sent with the start request; throws BadRequestException. */
  parseContext(raw: unknown): TContext;
  /**
   * Checks the target exists and this person may upload to it, and says where
   * the file goes. Run at the start and again at completion, so a target
   * deleted in between is caught.
   */
  prepare(args: { targetId: string | null; context: TContext; actor: UploadActor }): Promise<{ keyPrefix: string }>;
  /**
   * A last look at what arrived, after the generic size/type/format checks.
   * A refusal deletes the file.
   */
  inspect?(args: { upload: Upload; context: TContext; info: StoredObjectInfo }): Promise<UploadRefusal | null>;
  /** Records the accepted file, inside the transaction that completes the upload. Returns what it became. */
  record(
    tx: Prisma.TransactionClient,
    args: { upload: Upload; context: TContext; ref: ObjectRef; info: StoredObjectInfo; actor: UploadActor },
  ): Promise<{ id: string }>;
  /** What the uploader gets back — also for a repeated completion of the same upload. */
  present(resultId: string): Promise<TResult>;
}

/** The purposes the running app knows, registered by their owning modules. */
@Injectable()
export class UploadPurposeRegistry {
  private readonly purposes = new Map<string, UploadPurpose>();

  register<TContext, TResult>(purpose: UploadPurpose<TContext, TResult>): void {
    if (this.purposes.has(purpose.key)) {
      throw new Error(`An upload purpose named "${purpose.key}" is already registered`);
    }
    // Stored without its types: UploadService only ever passes a purpose the
    // context that purpose itself parsed.
    this.purposes.set(purpose.key, purpose as UploadPurpose);
  }

  get(key: string): UploadPurpose {
    const purpose = this.purposes.get(key);
    if (!purpose) throw new BadRequestException(`"${key}" is not a kind of upload this app accepts.`);
    return purpose;
  }

  all(): UploadPurpose[] {
    return [...this.purposes.values()];
  }
}

/** Whether `actor` may use `purpose` at all (before `prepare` looks at the target). */
export function mayUse(purpose: UploadPurpose, actor: Pick<UploadActor, 'roles'>): boolean {
  return purpose.roles.length === 0 || purpose.roles.some((role) => actor.roles.includes(role));
}
