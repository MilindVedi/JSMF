import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MentorshipBookingStatus } from "@/lib/api/admin-mentorship";

const LABEL: Record<MentorshipBookingStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PAID_UNSCHEDULED: "Paid, needs a time",
  EXPIRED: "Hold lapsed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

const STYLE: Record<MentorshipBookingStatus, string> = {
  PENDING_PAYMENT: "border-border text-muted-foreground",
  CONFIRMED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  PAID_UNSCHEDULED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  EXPIRED: "border-border text-muted-foreground",
  CANCELLED: "border-destructive/30 bg-destructive/10 text-destructive",
  COMPLETED: "border-border bg-muted text-foreground",
  NO_SHOW: "border-border bg-muted text-muted-foreground",
};

export function BookingStatusBadge({ status }: { status: MentorshipBookingStatus }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", STYLE[status])}>
      {LABEL[status]}
    </Badge>
  );
}

/**
 * `"2026-10-20T19:00"` read as a wall-clock time in `timeZone` → an ISO
 * instant. What `<input type="datetime-local">` gives is zone-less; the
 * offering's zone (IST) is what the admin means, whatever their own laptop
 * is set to. Two passes settle the offset correctly around DST changes.
 */
export function zonedLocalToIso(local: string, timeZone: string): string {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);

  let guess = wall;
  for (let i = 0; i < 2; i += 1) guess = wall - offsetMs(guess, timeZone);
  return new Date(guess).toISOString();
}

/** An instant → `"2026-10-20T19:00"` as it reads in `timeZone`. */
export function isoToZonedLocal(iso: string, timeZone: string): string {
  const parts = zonedParts(new Date(iso).getTime(), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function offsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(instant / 60_000) * 60_000;
}

function zonedParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}
