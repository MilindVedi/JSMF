import { Badge } from "@/components/ui/badge";
import type { FeedbackFormStatus } from "@/lib/api/admin-feedback";

/** The native select used across the session page's cards. */
export const SELECT = "h-9 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-60";

const STATUS: Record<FeedbackFormStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  OPEN: { label: "Open", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  CLOSED: { label: "Closed", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export function FormStatusBadge({ status }: { status: FeedbackFormStatus }) {
  const { label, className } = STATUS[status];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

export function istShort(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** ISO → the value a datetime-local input wants, in this browser's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value → ISO, or null when cleared. */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
