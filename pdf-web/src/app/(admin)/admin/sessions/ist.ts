/** "12 Oct 2026, 7:30 pm" in IST: sessions are announced in IST whatever the admin's own zone. */
export function istLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
