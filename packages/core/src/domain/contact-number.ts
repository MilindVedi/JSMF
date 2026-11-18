/**
 * The contact mobile number as people type it. The API is the judge of what
 * is a real number (it checks length and range for the country); these only
 * turn the common Indian spellings into one, so "98765 43210", "098765 43210"
 * and "+91 98765-43210" all mean the same saved number.
 */

/**
 * `+919876543210` for any Indian spelling (10 digits, with a leading 0 or
 * 91, or +91), the typed `+…` for another country, or null when it cannot be
 * a mobile number. An empty field is "" (remove), not null.
 */
export function toContactE164(raw: string): string | null {
  const compact = raw.replace(/[\s\-().]/g, "");
  if (compact === "") return "";
  const indian = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(compact);
  if (indian) return `+91${indian[1]}`;
  if (/^\+[1-9]\d{6,14}$/.test(compact)) return compact;
  return null;
}

/** `+91 98765 43210` for an Indian number; any other country as stored. */
export function formatContactNumber(e164: string): string {
  const india = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return india ? `+91 ${india[1]} ${india[2]}` : e164;
}
