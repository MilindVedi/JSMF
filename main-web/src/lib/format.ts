/**
 * Sessions are announced in IST for Indian aspirants, so labels are always
 * formatted in Asia/Kolkata — never the visitor's own zone, which would show
 * someone abroad a different time from the one in the email and on Telegram.
 */
const IST = "Asia/Kolkata";

export function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function timeLabel(iso: string, durationMinutes: number): string {
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .toUpperCase();
  return `${time} IST · ${durationMinutes} minutes`;
}

/** "Sun, 12 Oct" — for listing the days of a multi-day session. */
export function shortDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** What the site shows wherever a session has no dates fixed yet. */
export const TO_BE_ANNOUNCED = "To be announced";

/** "Sunday, 12 October 2026", or "3 days, from Sunday, 12 October 2026". */
export function sessionDateLabel(session: { startsAt: string | null; days: unknown[] }): string {
  if (!session.startsAt) return TO_BE_ANNOUNCED;

  const first = dateLabel(session.startsAt);
  return session.days.length > 1 ? `${session.days.length} days, from ${first}` : first;
}

/** Paise string to "₹99" / "₹99.50" without ever going through a float. */
export function formatMoney(minor: string | null, currency = "INR"): string {
  if (minor === null) return "";
  const value = BigInt(minor);
  const major = value / 100n;
  const paise = value % 100n;
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  const whole = major.toLocaleString("en-IN");
  return paise === 0n ? `${symbol}${whole}` : `${symbol}${whole}.${paise.toString().padStart(2, "0")}`;
}
