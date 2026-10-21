/**
 * Whether a file's first bytes are what its declared type says.
 *
 * The type a browser declares comes from the file's extension, so a renamed
 * file passes a MIME check untouched. On the multipart path that is all there
 * was; a direct upload is checked here too, by reading its first bytes back
 * from storage, because nothing else ever looks inside the file before buyers
 * download it.
 *
 * A signature proves the format, not that the file is well-formed — a
 * truncated PDF still starts with `%PDF-`. Size is checked separately.
 */

/** How many leading bytes `matchesSignature` needs. */
export const SIGNATURE_BYTES = 1024;

const startsWith = (head: Buffer, bytes: number[], at = 0) =>
  head.length >= at + bytes.length && bytes.every((byte, index) => head[at + index] === byte);

const SIGNATURES: Record<string, (head: Buffer) => boolean> = {
  // The PDF spec lets a header sit anywhere in the first 1024 bytes (some
  // generators put a byte-order mark or junk before it), so not only at 0.
  'application/pdf': (head) => head.subarray(0, SIGNATURE_BYTES).includes('%PDF-'),
  'image/png': (head) => startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (head) => startsWith(head, [0xff, 0xd8, 0xff]),
  'image/webp': (head) => startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8),
  // A local file header, or the end-of-directory record of an empty archive.
  'application/zip': (head) => startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]),
};

/** False when the bytes are not the declared type, or the type has no known signature. */
export function matchesSignature(mimeType: string, head: Buffer): boolean {
  const check = SIGNATURES[mimeType];
  return check ? check(head) : false;
}
