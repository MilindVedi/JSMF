import Link from "next/link";
import { format } from "date-fns";
import type { SessionMode, TestSession } from "@/types";
import { cn } from "@/lib/utils";

export const SESSION_MODE_LABEL: Record<SessionMode, string> = {
  browse: "Question Bank",
  "custom-test": "Custom Test",
  bookmarks: "Bookmarks Revision",
  "wrong-questions": "Wrong Questions Revision",
};

export function SessionHistoryRow({
  session,
  accuracy,
  correct,
  incorrect,
  unattempted,
}: {
  session: TestSession;
  accuracy: number;
  correct: number;
  incorrect: number;
  unattempted: number;
}) {
  return (
    <Link
      href={`/practice/${session.id}/results`}
      className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{session.label}</p>
          <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
            {SESSION_MODE_LABEL[session.mode]}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {session.completedAt && format(new Date(session.completedAt), "MMM d, yyyy")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs">
        <span className="text-success-foreground">{correct} correct</span>
        <span className="text-error-foreground">{incorrect} incorrect</span>
        {unattempted > 0 && <span className="text-muted-foreground">{unattempted} skipped</span>}
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-semibold",
            accuracy >= 70
              ? "bg-success text-success-foreground"
              : accuracy >= 40
                ? "bg-flag text-flag-foreground"
                : "bg-error text-error-foreground"
          )}
        >
          {accuracy}%
        </span>
      </div>
    </Link>
  );
}
