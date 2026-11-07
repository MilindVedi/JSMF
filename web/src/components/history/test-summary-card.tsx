import Link from "next/link";
import { format } from "date-fns";
import type { TestSession } from "@jsmf/core/domain";
import { ScorePill } from "@/components/common/score";

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
      <ScorePill value={accuracy} />
    </Link>
  );
}
