"use client";

import Link from "next/link";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyLimitError } from "@/lib/data-source";

/** Full-area spinner, matching the app's existing loading treatment. */
export function PageLoading({ className = "min-h-[60dvh]" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Placeholder rows for a list card while it loads. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-4">
          <Skeleton className="size-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A friendly failure with a retry, used by every wired screen. */
export function QueryError({
  error,
  onRetry,
  title = "Something went wrong",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  if (error instanceof DailyLimitError) return <DailyLimitNotice message={error.message} />;
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={error instanceof Error ? error.message : "Please try again in a moment."}
      action={
        onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

/** Shown when the free daily question allowance has been used up. */
export function DailyLimitNotice({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={Lock}
      title="You've used today's free questions"
      description={
        message ??
        "Free practice resets at midnight (India time). Upgrade for unlimited practice across every exam."
      }
      action={
        <Link href="/subscription" className={buttonVariants({ size: "sm" })}>
          See plans
        </Link>
      }
    />
  );
}
