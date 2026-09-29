import { describe, expect, it } from 'vitest';
import { GcsStorageAdapter } from './gcs-storage.adapter';
import type { AppConfig } from '../../../config/config.module';

/**
 * The parts of the adapter that are pure decisions rather than network calls:
 * where an object lands, what it is called, and which bucket answers for a
 * given visibility.
 *
 * These are worth testing precisely because they are the ones a reader would
 * assume are obvious. Key construction decides whether a user-supplied filename
 * can steer a write, and the bucket split *is* the access control — a mistake
 * in either is a purchased file in the wrong place, which no amount of correct
 * IAM would fix.
 *
 * The network paths are not mocked. A test asserting that the SDK was called
 * with certain arguments would restate this file rather than verify anything;
 * signing in particular behaves differently with a key file than with Cloud
 * Run's metadata credentials, so only the deployed service can confirm it.
 */

const PRIVATE_BUCKET = 'jsmf-private-test';
const PUBLIC_BUCKET = 'jsmf-public-test';

function adapter(): GcsStorageAdapter {
  const config = {
    get(key: string) {
      if (key === 'GCS_PRIVATE_BUCKET') return PRIVATE_BUCKET;
      if (key === 'GCS_PUBLIC_BUCKET') return PUBLIC_BUCKET;
      if (key === 'GCS_PROJECT_ID') return 'test-project';
      if (key === 'STORAGE_SIGNED_URL_TTL_SECONDS') return 300;
      return undefined;
    },
  } as unknown as AppConfig;

  return new GcsStorageAdapter(config);
}

/** Reaches the private helpers, which are private for callers rather than for tests. */
function internals(instance: GcsStorageAdapter) {
  return instance as unknown as {
    buildObjectKey(request: { originalFilename: string; keyPrefix?: string }): string;
    bucketFor(visibility: 'PRIVATE' | 'PUBLIC'): string;
  };
}

describe('GCS adapter', () => {
  it('refuses to construct without both buckets', () => {
    const config = { get: () => undefined } as unknown as AppConfig;

    // Fails at boot with a clear reason rather than at the first upload with
    // an `undefined` bucket name in the request.
    expect(() => new GcsStorageAdapter(config)).toThrow(/GCS_PRIVATE_BUCKET/);
  });

  it('routes private and public uploads to different buckets', () => {
    const instance = internals(adapter());

    // The separation is the access control: the private bucket is the one with
    // public access prevention enforced.
    expect(instance.bucketFor('PRIVATE')).toBe(PRIVATE_BUCKET);
    expect(instance.bucketFor('PUBLIC')).toBe(PUBLIC_BUCKET);
    expect(instance.bucketFor('PRIVATE')).not.toBe(instance.bucketFor('PUBLIC'));
  });

  describe('object keys', () => {
    it('never puts the original filename in the key', () => {
      const key = internals(adapter()).buildObjectKey({
        originalFilename: 'Pathology Revision Notes.pdf',
        keyPrefix: 'products/abc',
      });

      expect(key).not.toContain('Pathology');
      expect(key).toMatch(/^products\/abc\/[0-9a-f-]{36}\.pdf$/);
    });

    it('cannot be steered out of its prefix by a hostile filename', () => {
      const key = internals(adapter()).buildObjectKey({
        originalFilename: '../../../etc/passwd',
        keyPrefix: 'products/abc',
      });

      // The name contributes at most an extension, so traversal has nothing to
      // travel through.
      expect(key).not.toContain('..');
      expect(key.startsWith('products/abc/')).toBe(true);
      expect(key.split('/')).toHaveLength(3);
    });

    it('drops an extension that is not a plain extension', () => {
      const key = internals(adapter()).buildObjectKey({
        originalFilename: 'invoice.pdf.exe;rm -rf /',
        keyPrefix: 'x',
      });

      expect(key).toMatch(/^x\/[0-9a-f-]{36}$/);
    });

    it('gives two uploads of the same filename different keys', () => {
      const request = { originalFilename: 'notes.pdf', keyPrefix: 'products/abc' };
      const instance = internals(adapter());

      // Overwriting someone else's purchased file is the failure this prevents.
      expect(instance.buildObjectKey(request)).not.toBe(instance.buildObjectKey(request));
    });

    it('works without a prefix', () => {
      expect(internals(adapter()).buildObjectKey({ originalFilename: 'a.png' })).toMatch(
        /^[0-9a-f-]{36}\.png$/,
      );
    });
  });

  it('serves public objects from an unsigned URL', async () => {
    const url = await adapter().getSignedDownloadUrl({
      provider: 'GCS',
      bucket: PUBLIC_BUCKET,
      objectKey: 'covers/one.png',
    });

    // Signing a cover image would expire it for no reason and defeat caching.
    expect(url).toBe(`https://storage.googleapis.com/${PUBLIC_BUCKET}/covers/one.png`);
    expect(url).not.toContain('X-Goog-Signature');
  });
});
