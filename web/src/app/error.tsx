"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { errorReporter } from "@/lib/error-reporting";

/**
 * Any page that throws while rendering lands here, inside the root layout
 * (fonts, theme and providers still work). The error is reported, and the
 * reference shown is Next.js's digest: the same id is on the server's own log
 * line for errors that happened during server rendering, so a screenshot from
 * a student is enough to find it.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    errorReporter.report(error, "render", { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        This page hit an unexpected error. It has been reported — trying again usually works.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          Go home
        </Button>
      </div>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
    </main>
  );
}
