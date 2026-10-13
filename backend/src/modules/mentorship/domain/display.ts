import { DateTime } from 'luxon';

/**
 * "Wed, 14 Oct 2026 · 7:00 – 7:45 pm IST" — how a call's time is written in
 * every email and admin view, always in the offering's own timezone so the
 * attendee and Dr. Angad read the same wall-clock time.
 *
 * en-IN is what makes the zone read "IST" rather than "GMT+5:30".
 */
export function callWhenLabel(startsAt: Date, endsAt: Date, timezone: string): string {
  const start = DateTime.fromJSDate(startsAt, { zone: timezone }).setLocale('en-IN');
  const end = DateTime.fromJSDate(endsAt, { zone: timezone }).setLocale('en-IN');
  const sameMeridiem = start.toFormat('a') === end.toFormat('a');

  const from = start.toFormat(sameMeridiem ? 'h:mm' : 'h:mm a');
  return `${start.toFormat('ccc, d LLL yyyy')} · ${from} – ${end.toFormat('h:mm a')} ${start.offsetNameShort ?? timezone}`;
}

/** "24 hours", "90 minutes", "2 days" — for the reschedule rule in emails and on the page. */
export function durationLabel(minutes: number): string {
  if (minutes % 1440 === 0 && minutes >= 1440) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes % 60 === 0 && minutes >= 60) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
