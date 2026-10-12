"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import "@/lib/core";
import { useStartSession as useCoreStartSession } from "@jsmf/core/hooks";
import type { DailyLimitError } from "@jsmf/core/data-source";
import { dataSource } from "@/lib/data-source";

/**
 * Web's binding of the PYQ hooks. The hooks themselves — queries, writes,
 * query keys, optimistic updates — live in @jsmf/core (packages/core) and are
 * re-exported here unchanged; importing this module also guarantees core has
 * been configured (`@/lib/core`). What stays here is what only a browser app
 * does: navigating with the Next router, toasts with actions, and reading
 * which adapter this build was compiled with.
 */
export * from "@jsmf/core/hooks";

export const pyqCapabilities = dataSource.capabilities;
export const isApiDataSource = dataSource.kind === "api";

/** Shows the daily-allowance message with a way to upgrade. */
export function notifyDailyLimit(error: DailyLimitError, onUpgrade: () => void) {
  toast.error("You've reached today's free limit", {
    description: error.message,
    action: { label: "See plans", onClick: onUpgrade },
  });
}

/** Where "Save & exit" returns to: the page the session was started from. */
function currentHref(): string | undefined {
  return typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
}

/**
 * Creates a session and opens it at /practice/[id]. Errors (including the
 * free daily allowance) surface as a toast rather than a broken page.
 */
export function useStartSession() {
  const router = useRouter();
  return useCoreStartSession({
    onStarted: (id, startIndex) => router.push(`/practice/${id}?i=${startIndex}`),
    onDailyLimit: (error) => notifyDailyLimit(error, () => router.push("/subscription")),
    getSourceHref: currentHref,
  });
}
