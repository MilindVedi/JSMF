/**
 * Slugs are the public URL of a product (`/p/{slug}`), and that URL ends up
 * pasted into YouTube descriptions where it lives forever. Everything here
 * treats a slug as an identifier with consequences rather than a formatted
 * title.
 */

const MAX_LENGTH = 160;

/** A slug is lowercase, alphanumeric, hyphen-separated, and never hyphen-edged. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    // Strip combining marks so "Pathología" becomes "pathologia" rather than
    // losing the letter entirely.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '');

  return slug;
}

/**
 * Appends `-2`, `-3`, … until the slug is free.
 *
 * The suffix is a counter rather than a random string because these are URLs a
 * person reads aloud and types; `neet-pg-anatomy-2` is recoverable from memory
 * in a way that `neet-pg-anatomy-f3a91c` is not.
 */
export async function uniqueSlug(
  desired: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = desired || 'untitled';

  if (!(await isTaken(base))) return base;

  for (let suffix = 2; suffix < 1000; suffix++) {
    // Truncate the base, not the suffix: a slug must stay within the column's
    // 160 characters, and silently dropping the discriminator would produce a
    // duplicate that the unique index then rejects for no visible reason.
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, MAX_LENGTH - tail.length).replace(/-+$/, '')}${tail}`;

    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error(`Could not derive a free slug from "${desired}"`);
}
