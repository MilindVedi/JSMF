import { ApiError, getAccessToken } from "@jsmf/core/api";
import { createErrorReporter, type ErrorReporter } from "@jsmf/core/observability";

/**
 * This app's crash reporter: @jsmf/core's reporter wired to the browser.
 * Installed for the whole page by src/instrumentation-client.ts; the error
 * boundaries (app/error.tsx, app/global-error.tsx) report through it too.
 *
 * Sends to `/api/client-errors` — this site's own proxy, so same-origin, the
 * same way every API call goes. Off when NEXT_PUBLIC_CLIENT_ERRORS_ENABLED is
 * "false" (inlined at build time; unset means on), and for automated browsers.
 */

const ENDPOINT = "/api/client-errors";

export const errorReporter: ErrorReporter = createErrorReporter({
  app: "PYQ",
  platform: "web",
  release: process.env.NEXT_PUBLIC_APP_RELEASE || undefined,
  send: sendFromBrowser,
  currentPage: () => window.location.pathname,
  // A refused request (401, 403, 404, 409 …) is the API answering, not the
  // app breaking — the screens already handle those. 5xx are kept.
  ignore: (error) => error instanceof ApiError && error.status < 500,
  enabled: () =>
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_CLIENT_ERRORS_ENABLED !== "false" &&
    !navigator.webdriver,
});

/**
 * text/plain on purpose: it is what sendBeacon can send without a CORS
 * preflight, and using it for fetch too keeps one request shape. The access
 * token goes along only on the fetch path (a beacon cannot carry headers),
 * so the server can say whose session broke; it is the same token every API
 * call from this page already sends to this same origin.
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

/**
 * Script errors nothing caught, and promise rejections nothing handled — the
 * two ways a browser says "this page broke" outside React. Errors React
 * catches go through the error boundaries instead.
 */
export function installBrowserErrorHandlers(reporter: ErrorReporter): void {
  window.addEventListener("error", (event) => {
    // A failed <img>/<script> load also fires "error", on the element, with
    // no error object. Those are not script errors.
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
