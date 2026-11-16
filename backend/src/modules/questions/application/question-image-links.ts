import { Injectable, Logger } from '@nestjs/common';
import type { StorageProvider } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { StorageService } from '../../storage/application/storage.service';
import type { ObjectRef } from '../../storage/domain/storage-provider.port';

/** Where on the question an image goes: under the question, or with the explanation. */
export const QUESTION_IMAGE_FIELDS = ['stem', 'explanation'] as const;
export type QuestionImageField = (typeof QUESTION_IMAGE_FIELDS)[number];

/** The columns that address a question's two images: a pasted link, and an uploaded file. */
export interface QuestionImageColumns {
  stemImageUrl: string | null;
  stemImageStorageProvider: StorageProvider | null;
  stemImageBucket: string | null;
  stemImageObjectKey: string | null;
  explanationImageUrl: string | null;
  explanationImageStorageProvider: StorageProvider | null;
  explanationImageBucket: string | null;
  explanationImageObjectKey: string | null;
}

export const QUESTION_IMAGE_COLUMNS_SELECT = {
  stemImageUrl: true,
  stemImageStorageProvider: true,
  stemImageBucket: true,
  stemImageObjectKey: true,
  explanationImageUrl: true,
  explanationImageStorageProvider: true,
  explanationImageBucket: true,
  explanationImageObjectKey: true,
} as const;

/** The uploaded file behind one of a question's images, or null when it has none. */
export function questionImageRefOf(row: QuestionImageColumns, field: QuestionImageField): ObjectRef | null {
  const [provider, bucket, objectKey] =
    field === 'stem'
      ? [row.stemImageStorageProvider, row.stemImageBucket, row.stemImageObjectKey]
      : [row.explanationImageStorageProvider, row.explanationImageBucket, row.explanationImageObjectKey];
  return provider && bucket && objectKey ? { provider, bucket, objectKey } : null;
}

/** The three columns of one image's file, set to `ref` or cleared. */
export function questionImageFileData(field: QuestionImageField, ref: ObjectRef | null) {
  return field === 'stem'
    ? { stemImageStorageProvider: ref?.provider ?? null, stemImageBucket: ref?.bucket ?? null, stemImageObjectKey: ref?.objectKey ?? null }
    : {
        explanationImageStorageProvider: ref?.provider ?? null,
        explanationImageBucket: ref?.bucket ?? null,
        explanationImageObjectKey: ref?.objectKey ?? null,
      };
}

/** Links kept per server instance — far more than the bank's images, small enough to never matter. */
const MAX_CACHED_LINKS = 5000;

/**
 * Turns a question's images into links a browser can show.
 *
 * An uploaded image is in the private bucket, so its link is signed and
 * short-lived (QUESTION_IMAGE_LINK_TTL_SECONDS): made only when the API sends
 * the question to someone allowed to see it, so the image follows exactly the
 * rule of its question — a stem image goes wherever the stem does, an
 * explanation image only where the explanation does. A pasted link is used as
 * it is.
 *
 * A link is reused until half its life is gone, for two reasons. Signing on
 * Cloud Run is a call to Google (IAM signBlob), and a 200-question test must
 * not make 200 of them per load. And the same link for a while lets browsers
 * and the app keep the image in their caches. Every link handed out still has
 * at least half the TTL left, which is what the TTL has to cover: a student
 * sitting on one session longer than that may need to reload it.
 *
 * Signing that fails leaves the image out (logged as an error) rather than
 * failing the whole session or review.
 */
@Injectable()
export class QuestionImageLinks {
  private readonly logger = new Logger(QuestionImageLinks.name);
  private readonly cache = new Map<string, { link: Promise<string>; expiresAt: number }>();

  constructor(
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  /** The link to show for one image: the uploaded file's, else the pasted link, else null. */
  async linkFor(row: QuestionImageColumns, field: QuestionImageField): Promise<string | null> {
    const ref = questionImageRefOf(row, field);
    if (!ref) return field === 'stem' ? row.stemImageUrl : row.explanationImageUrl;
    try {
      return await this.signed(ref);
    } catch (error) {
      this.logger.error(`Could not sign a question image link (${ref.bucket}/${ref.objectKey}): ${String(error)}`);
      return null;
    }
  }

  /**
   * A question view with its image links filled in. The explanation image
   * only when the view already carries the explanation — the answered view —
   * so a view that hides the answer never gets a link to its explanation image.
   */
  async apply<V extends { stemImageUrl: string | null; explanationImageUrl?: string | null }>(
    view: V,
    row: QuestionImageColumns,
  ): Promise<V> {
    const withStem = { ...view, stemImageUrl: await this.linkFor(row, 'stem') };
    if ('explanationImageUrl' in view) withStem.explanationImageUrl = await this.linkFor(row, 'explanation');
    return withStem;
  }

  private signed(ref: ObjectRef): Promise<string> {
    const ttlSeconds = this.config.get('QUESTION_IMAGE_LINK_TTL_SECONDS');
    const key = `${ref.provider}:${ref.bucket}:${ref.objectKey}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt - now > (ttlSeconds * 1000) / 2) return cached.link;

    const link = this.storage.getSignedDownloadUrl(ref, { disposition: 'inline', ttlSeconds });
    // Map order is insertion order: re-inserting keeps the oldest first, so
    // the one dropped at the cap is the least recently signed.
    this.cache.delete(key);
    this.cache.set(key, { link, expiresAt: now + ttlSeconds * 1000 });
    if (this.cache.size > MAX_CACHED_LINKS) this.cache.delete(this.cache.keys().next().value!);
    // A failed signing is not remembered: the next request tries again.
    link.catch(() => {
      if (this.cache.get(key)?.link === link) this.cache.delete(key);
    });
    return link;
  }
}
