import Link from "next/link";
import { format } from "date-fns";
import type { TestSession } from "@/types";
import { cn } from "@/lib/utils";

export function TestSummaryCard({
  session,
  accuracy,
  correct,
  incorrect,
}: {
  session: TestSession;
  accuracy: number;
  correct: number;
  incorrect: number;
}) {
  return (
    <Link
      href={`/practice/${session.id}/results`}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{session.label}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {session.completedAt && format(new Date(session.completedAt), "MMM d, yyyy")} · {correct} correct ·{" "}
          {incorrect} incorrect
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
          accuracy >= 70
            ? "bg-success text-success-foreground"
            : accuracy >= 40
              ? "bg-flag text-flag-foreground"
              : "bg-error text-error-foreground"
        )}
      >
        {accuracy}%
      </span>
    </Link>
  );
}
