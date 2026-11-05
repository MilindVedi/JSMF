import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One figure from the student's record, at the top of the dashboard.
 *
 * The number leads: it sits on its own line at display size, with the label
 * above it and the icon tucked into the corner as a tinted badge. Before, the
 * icon shared a row with the number and the label ran underneath at 12px, so
 * four of these read as a toolbar rather than as a scoreboard.
 *
 * `tone` only colours the badge. The number stays in the text colour whatever
 * it is: a red "3" reads as a warning, and a count of questions to revise is
 * not a warning.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  /** One line under the number, e.g. what it is out of. */
  hint?: string;
  tone?: "default" | "success" | "error" | "flag";
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-muted-foreground">{label}</p>
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            tone === "default" && "bg-primary/10 text-primary",
            tone === "success" && "bg-success text-success-foreground",
            tone === "error" && "bg-error text-error-foreground",
            tone === "flag" && "bg-flag text-flag-foreground"
          )}
        >
          <Icon className="size-4" strokeWidth={1.9} />
        </div>
      </div>
      <div>
        <p className="font-heading text-3xl leading-none font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
