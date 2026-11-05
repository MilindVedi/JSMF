import { ApiError, getAccessToken } from "@/lib/api/client";
import { createErrorReporter, type ErrorReporter } from "./error-report";

/**
 * This site's crash reporter: the shared reporter (./error-report.ts, a copy
 * of @jsmf/core's) wired to the browser. Installed for the whole page by
 * src/instrumentation-client.ts; the error boundaries (app/error.tsx,
 * app/global-error.tsx) report through it too.
 *
 * Same shape as web/src/lib/error-reporting.ts — apps never import each
 * other's source. Sends to `/api/client-errors`, this site's own proxy. Off
 * when NEXT_PUBLIC_CLIENT_ERRORS_ENABLED is "false" (inlined at build time;
 * unset means on), and for automated browsers.
 */

const ENDPOINT = "/api/client-errors";

export const errorReporter: ErrorReporter = createErrorReporter({
  app: "MAIN",
  platform: "web",
  release: process.env.NEXT_PUBLIC_APP_RELEASE || undefined,
  send: sendFromBrowser,
  currentPage: () => window.location.pathname,
  // A refused request is the API answering, not the site breaking.
  ignore: (error) => error instanceof ApiError && error.status < 500,
  enabled: () =>
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_CLIENT_ERRORS_ENABLED !== "false" &&
    !navigator.webdriver,
});

/**
 * text/plain: what sendBeacon can send without a CORS preflight. The access
 * token rides only on the fetch path, as on every other call to this origin.
 */
function sendFromBrowser(body: string, { leaving }: { leaving: boolean }): void {
  if (leaving && typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    } catch {
      // Fall through to fetch.
    }
  }

  const headers: Record<string, string> = { "Content-Type": "text/plain" };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    void fetch(ENDPOINT, { method: "POST", body, headers, keepalive: true, credentials: "omit" }).catch(() => undefined);
  } catch {
    // No fetch, or keepalive unsupported: the report is dropped.
  }
}

/** Script errors nothing caught, and promise rejections nothing handled. */
export function installBrowserErrorHandlers(reporter: ErrorReporter): void {
  window.addEventListener("error", (event) => {
    // A failed <img>/<script> load fires "error" on the element, with no error object.
    if (!(event instanceof ErrorEvent)) return;
    reporter.report(event.error ?? event.message, "error");
  });
  window.addEventListener("unhandledrejection", (event) => reporter.report(event.reason, "unhandledrejection"));

  const leave = () => reporter.flush(true);
  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
  });
}
