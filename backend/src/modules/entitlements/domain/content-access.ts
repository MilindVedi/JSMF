import { ContentAccessPurpose, DownloadPolicy } from '@prisma/client';

export { ContentAccessPurpose };

/**
 * Whether buyers may download a product's file, or only read it in the
 * browser. The product's own policy wins; INHERIT follows the store-wide switch.
 *
 * Reading is never affected, and only the product's PDF is: extras that the
 * reader cannot open stay downloadable. The switch exists so the store can
 * become read-only (like the mobile apps will be) without taking anything
 * away. It is a store policy, not copy protection: reading still hands the
 * browser the whole file.
 */
export function isDownloadAllowed(policy: DownloadPolicy, storeWideEnabled: boolean): boolean {
  if (policy === DownloadPolicy.ALLOWED) return true;
  if (policy === DownloadPolicy.BLOCKED) return false;
  return storeWideEnabled;
}

/**
 * How a granted link should behave in the browser. A download forces the save
 * dialog; reading and samples open in place so the reader can fetch the file
 * piece by piece.
 */
export function dispositionFor(purpose: ContentAccessPurpose): 'inline' | 'attachment' {
  return purpose === ContentAccessPurpose.DOWNLOAD ? 'attachment' : 'inline';
}
