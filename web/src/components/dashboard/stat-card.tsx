import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "default" | "success" | "error" | "flag";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          tone === "default" && "bg-muted text-muted-foreground",
          tone === "success" && "bg-success text-success-foreground",
          tone === "error" && "bg-error text-error-foreground",
          tone === "flag" && "bg-flag text-flag-foreground"
        )}
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="font-heading text-xl leading-tight font-semibold text-foreground">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
