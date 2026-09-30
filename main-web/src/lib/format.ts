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
