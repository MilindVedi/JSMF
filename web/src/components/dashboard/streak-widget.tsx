import { Flame } from "lucide-react";

export function StreakWidget({ days }: { days: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-accent/20 px-3 py-1.5">
      <Flame className="size-4 text-accent-foreground" strokeWidth={2} />
      <span className="text-sm font-semibold text-accent-foreground">
        {days} day{days === 1 ? "" : "s"} streak
      </span>
    </div>
  );
}
