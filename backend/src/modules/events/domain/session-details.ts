/**
 * The details a session attendee needs from us — when it is, how to join, and
 * where the group is — and, per attendee, which of them they still need.
 *
 * Pure: no database, no email. Each detail is reduced to one comparable value
 * (the link itself, or a fingerprint of the schedule). What someone was last
 * sent is stored as that same value, so:
 *
 *   nothing stored             → NOT_SENT
 *   stored ≠ current           → CHANGED  (they have an older one)
 *   stored = current           → UP_TO_DATE
 *   the session has no value   → NOT_SET  (nothing to send; a removed link)
 *
 * Comparing values rather than version numbers is what makes going back to an
 * earlier link right: whoever last received that exact link is up to date.
 *
 * To add a detail (a WhatsApp group, a recording): add it to SESSION_DETAILS
 * with how to read its current value, and to the email template. The tables
 * store items as text, so no migration is needed.
 */

export const SESSION_DETAILS = ['dates', 'join_link', 'telegram'] as const;
export type SessionDetail = (typeof SESSION_DETAILS)[number];

export type DetailStatus = 'UP_TO_DATE' | 'NOT_SENT' | 'CHANGED' | 'NOT_SET';

export interface SessionDetailSource {
  days: Array<{ startsAt: Date; durationMinutes: number }>;
  joinUrl: string | null;
  telegramUrl: string | null;
}

/** Each detail's current value, or null when the session has none. */
export type DetailValues = Record<SessionDetail, string | null>;

/**
 * The schedule as one comparable string: "<ISO start>/<minutes>" per day, in
 * start order. Moving any day, or changing its length, changes it.
 *
 * The migration that carried over earlier announcements builds the same string
 * in SQL; the two must stay identical.
 */
export function datesFingerprint(days: SessionDetailSource['days']): string | null {
  if (days.length === 0) return null;
  return [...days]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((day) => `${day.startsAt.toISOString()}/${day.durationMinutes}`)
    .join(',');
}

export function currentDetailValues(session: SessionDetailSource): DetailValues {
  return {
    dates: datesFingerprint(session.days),
    join_link: blankToNull(session.joinUrl),
    telegram: blankToNull(session.telegramUrl),
  };
}

export function detailStatus(current: string | null, received: string | undefined): DetailStatus {
  if (current === null) return 'NOT_SET';
  if (received === undefined) return 'NOT_SENT';
  return received === current ? 'UP_TO_DATE' : 'CHANGED';
}

/** Every detail's status for one attendee, given what they were last sent. */
export function detailStatuses(
  current: DetailValues,
  received: Partial<Record<SessionDetail, string>>,
): Record<SessionDetail, DetailStatus> {
  return Object.fromEntries(
    SESSION_DETAILS.map((detail) => [detail, detailStatus(current[detail], received[detail])]),
  ) as Record<SessionDetail, DetailStatus>;
}

/** What this attendee still needs: anything never sent, or changed since. */
export function outstandingDetails(statuses: Record<SessionDetail, DetailStatus>): SessionDetail[] {
  return SESSION_DETAILS.filter((detail) => statuses[detail] === 'NOT_SENT' || statuses[detail] === 'CHANGED');
}

/** The details an email carries, as receipts to store: only those the session actually has. */
export function valuesToRecord(current: DetailValues, details: readonly SessionDetail[]): Array<[SessionDetail, string]> {
  return details.flatMap((detail) => (current[detail] === null ? [] : [[detail, current[detail]!] as [SessionDetail, string]]));
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
