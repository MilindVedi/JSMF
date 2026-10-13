/**
 * "Preparing for" on the booking form. Its own list rather than the live
 * session's: a one-to-one call also serves students still in their MBBS
 * professional exams, which a session for NEET-PG/FMGE/INI-CET does not.
 * Plain text on the booking, so changing a label is a deploy, never a migration.
 */
export const MENTORSHIP_EXAM_OPTIONS = ['NEET-PG', 'INI-CET', 'FMGE', 'MBBS Professional'] as const;

/** Minor units to "₹999" — the same rule every receipt uses. */
export function formatMoney(amountMinor: bigint, currency: string): string {
  const major = amountMinor / 100n;
  const minor = amountMinor % 100n;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${minor === 0n ? major : `${major}.${minor.toString().padStart(2, '0')}`}`;
}

/** How emails greet someone: the first word of the name they gave. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
