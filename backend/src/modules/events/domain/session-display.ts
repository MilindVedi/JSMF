/**
 * The choices the registration form offers. Stored as plain text on the
 * registration (not a database enum), so changing a label here is a deploy,
 * never a migration — and old registrations keep the label they were given.
 */
export const EXAM_OPTIONS = ['NEET-PG', 'INI-CET', 'FMGE', 'MBBS Professional'] as const;
export const STAGE_OPTIONS = ['1st / 2nd year', '3rd year', 'Final year', 'Intern', 'Repeater'] as const;

/**
 * Sessions are for Indian aspirants and are announced in IST, so every label
 * the system writes — emails today — is in IST regardless of where the server
 * runs. Cloud Run is UTC; formatting with the server's zone would move a
 * 7:30 PM session to 2:00 PM in the confirmation email.
 */
const TIME_ZONE = 'Asia/Kolkata';

export interface SessionDayTime {
  startsAt: Date;
  durationMinutes: number;
}

/** "Sunday, 12 October 2026 · 7:30 PM IST · 90 minutes" */
export function sessionDayLabel(day: SessionDayTime): string {
  const date = new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(day.startsAt);

  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(day.startsAt)
    .toUpperCase();

  return `${date} · ${time} IST · ${day.durationMinutes} minutes`;
}

/** One line for a one-day session; "Day 1 · …", "Day 2 · …" for longer ones. Days must be in order. */
export function sessionWhenLines(days: SessionDayTime[]): string[] {
  if (days.length === 1) return [sessionDayLabel(days[0])];
  return days.map((day, index) => `Day ${index + 1} · ${sessionDayLabel(day)}`);
}

/** Minor units to "₹499" — the same rule the purchase receipt uses. */
export function formatMoney(amountMinor: bigint, currency: string): string {
  const major = amountMinor / 100n;
  const minor = amountMinor % 100n;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${minor === 0n ? major : `${major}.${minor.toString().padStart(2, '0')}`}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
