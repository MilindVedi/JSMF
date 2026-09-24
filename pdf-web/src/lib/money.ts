/**
 * Money is minor units (paise) carried as a string, because the API serialises
 * BigInt as a string to avoid the precision loss `Number` introduces above
 * 2^53. These helpers are the only places that convert, and they do it for
 * display or for a single input field — never for arithmetic.
 */

const MINOR_PER_MAJOR = 100;

/** `"19900"` → `"₹199"`, `"19950"` → `"₹199.50"`. */
export function formatMoney(minor: string | null | undefined, currency = "INR"): string {
  if (minor === null || minor === undefined || minor === "") return "—";

  const value = Number(minor) / MINOR_PER_MAJOR;
  const symbol = currency === "INR" ? "₹" : `${currency} `;

  return `${symbol}${value.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** `"199"` or `"199.50"` (what an admin types) → `"19900"` / `"19950"`. */
export function rupeesToMinor(rupees: string): string {
  const trimmed = rupees.trim();
  if (!trimmed) return "0";

  // Rounded rather than truncated so "199.999" becomes 20000 rather than
  // silently losing a paisa, and String() keeps it out of float territory.
  return String(Math.round(Number(trimmed) * MINOR_PER_MAJOR));
}

/** `"19900"` → `"199"`, for prefilling the edit form. */
export function minorToRupees(minor: string | null | undefined): string {
  if (!minor) return "";
  const value = Number(minor) / MINOR_PER_MAJOR;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatBytes(bytes: string | number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === "") return "—";

  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
