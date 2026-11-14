/**
 * Crash reporting for the JSMF apps — the platform-free half.
 *
 * Collects errors, drops the noise, removes anything sensitive, dedupes, and
 * hands small batches to a transport the app injects (a beacon/fetch in a
 * browser, a fetch on the phone). The backend writes each one to the log as a
 * Cloud Error Reporting event: POST /api/client-errors, see
 * docs/observability/README.md.
 *
 * The rule this file exists to keep: **reporting must never affect the app.**
 * `report()` and `flush()` return nothing, throw nothing and await nothing.
 * If the endpoint is down or switched off, reports are simply lost.
 *
 * Copied, not imported, into main-web/ and pdf-web/
 * (src/lib/observability/error-report.ts) — those apps sit outside the npm
 * workspaces. Keep the copies identical; the request shape is the contract
 * with backend/src/modules/client-errors/domain/client-error.ts.
 */

export type ClientApp = "MAIN" | "PYQ" | "STORE";
export type ClientPlatform = "web" | "ios" | "android";
/** See CLIENT_ERROR_KINDS on the backend. */
export type ClientErrorKind = "error" | "unhandledrejection" | "render" | "chunk" | "fatal";

export interface ErrorReporterOptions {
  app: ClientApp;
  platform: ClientPlatform;
  /** The build, e.g. "2026.10.30-1" or the app version. Omitted when unknown. */
  release?: string;
  /**
   * Delivers one JSON body. `leaving` is true when the page or app is going
   * away, so the transport should use whatever survives that (sendBeacon).
   * Must not throw; a failed delivery is dropped, never retried.
   */
  send: (body: string, options: { leaving: boolean }) => void;
  /** The current page or screen, as a pathname. */
  currentPage: () => string;
  /** Errors the app expects and handles (a 401 from its own API, say). */
  ignore?: (error: unknown) => boolean;
  /** Checked on every report, so a kill switch needs no reload. */
  enabled?: () => boolean;
  /** Timers, injectable for tests. */
  schedule?: (fn: () => void, ms: number) => unknown;
}

export interface ErrorReporter {
  /** Queue an error. Safe to call anywhere, any time, with any value. */
  report(error: unknown, kind: ClientErrorKind, extra?: { digest?: string }): void;
  /** Send what is queued now. `leaving`: the page/app is going away. */
  flush(leaving: boolean): void;
}

interface Pending {
  kind: ClientErrorKind;
  name: string;
  message: string;
  stack?: string;
  page: string;
  digest?: string;
  count: number;
}

/** Matches the server's per-request limit. */
const MAX_BATCH = 5;
/**
 * Distinct errors one page load (or app run) will ever send. A page that is
 * broken in a loop says so with its first reports; the rest is noise and cost.
 */
const MAX_DISTINCT = 20;
const FLUSH_DELAY_MS = 2000;
const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;
const MAX_STACK_LINES = 50;

export function createErrorReporter(options: ErrorReporterOptions): ErrorReporter {
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  /** Everything reported so far, by fingerprint: queued or already sent. */
  const seen = new Map<string, Pending>();
  let queue: Pending[] = [];
  let timer = false;

  function flush(leaving: boolean): void {
    try {
      timer = false;
      while (queue.length > 0) {
        const errors = queue.splice(0, MAX_BATCH);
        const body: Record<string, unknown> = { app: options.app, platform: options.platform, errors };
        if (options.release) body.release = options.release;
        options.send(JSON.stringify(body), { leaving });
      }
    } catch {
      queue = [];
    }
  }

  function report(error: unknown, kind: ClientErrorKind, extra?: { digest?: string }): void {
    try {
      if (options.enabled && !options.enabled()) return;
      if (options.ignore?.(error)) return;

      const described = describe(error);
      if (!described || isNoise(described)) return;

      const key = `${described.name}|${described.message}|${firstFrame(described.stack)}`;
      const known = seen.get(key);
      if (known) {
        // Already sent: counted, not resent. Still queued: the count rides along.
        known.count += 1;
        return;
      }
      if (seen.size >= MAX_DISTINCT) return;

      const pending: Pending = {
        kind: isChunkError(described) ? "chunk" : kind,
        name: described.name,
        message: redactSecrets(described.message).slice(0, MAX_MESSAGE),
        page: redactSecrets(safePage(options.currentPage)),
        count: 1,
      };
      if (described.stack) pending.stack = cleanStack(described.stack);
      if (extra?.digest && /^[A-Za-z0-9_-]{1,64}$/.test(extra.digest)) pending.digest = extra.digest;

      seen.set(key, pending);
      queue.push(pending);
      if (!timer) {
        timer = true;
        schedule(() => flush(false), FLUSH_DELAY_MS);
      }
    } catch {
      // Reporting must never be the reason anything else fails.
    }
  }

  return { report, flush };
}

interface Described {
  name: string;
  message: string;
  stack?: string;
}

/**
 * Anything can be thrown. An Error gives its name, message and stack; a
 * string is its own message. Other values are described by type only —
 * serialising an arbitrary object could send whatever it happened to hold.
 */
function describe(error: unknown): Described | null {
  if (error instanceof Error || (typeof error === "object" && error !== null && "message" in error)) {
    const e = error as { name?: unknown; message?: unknown; stack?: unknown };
    const message = typeof e.message === "string" ? e.message : "";
    const name = typeof e.name === "string" && /^[A-Za-z_$][\w$.]{0,99}$/.test(e.name) ? e.name : "Error";
    const stack = typeof e.stack === "string" ? e.stack : undefined;
    if (!message && !stack) return null;
    return { name, message: message || name, stack };
  }
  if (typeof error === "string") return error ? { name: "Error", message: error } : null;
  if (error === undefined || error === null) return null;
  return { name: "Error", message: `Non-Error value thrown (${typeof error})` };
}

/**
 * Errors that are not JSMF's to fix: browser quirks, extensions injected into
 * the page, scripts an app's in-app browser injects (Instagram and Facebook
 * load theirs from iabjs://), cross-origin scripts that hide their details,
 * and the user's network dropping out.
 */
function isNoise({ name, message, stack }: Described): boolean {
  if (name === "AbortError") return true;
  if (/^Script error\.?$/i.test(message) && !stack) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  if (/^(Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed|Network request failed)$/i.test(message))
    return true;
  if (stack && /(chrome|moz|safari(-web)?|ms-browser)-extension:\/\//i.test(stack)) return true;
  if (stack && /\biabjs:\/\//i.test(stack)) return true;
  return false;
}

/** A page asset that would not load — usually an old tab after a deploy. */
function isChunkError({ name, message }: Described): boolean {
  return (
    name === "ChunkLoadError" ||
    /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      message,
    )
  );
}

function firstFrame(stack: string | undefined): string {
  return stack?.split("\n").find((line) => /:\d+/.test(line))?.trim() ?? "";
}

function cleanStack(stack: string): string {
  return redactSecrets(stack.slice(0, MAX_STACK * 2))
    .split("\n")
    .slice(0, MAX_STACK_LINES)
    .join("\n")
    .slice(0, MAX_STACK);
}

function safePage(currentPage: () => string): string {
  try {
    const page = currentPage().split(/[?#]/)[0];
    return page.startsWith("/") && !page.startsWith("//") ? page.slice(0, 300) : "/";
  } catch {
    return "/";
  }
}

const REPORTED_ERROR_EVENT = "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

/**
 * One log entry for an error the Next.js server hit while rendering a page,
 * running a route handler or a server action — for `onRequestError` in a
 * site's instrumentation.ts, which writes it to stderr as one JSON line.
 * Cloud Run sends that to Cloud Logging with severity ERROR, and the
 * Error Reporting fields group it per service like the API's own errors.
 *
 * No request headers are logged (they hold cookies and tokens) and the path
 * loses its query string. `digest` is the id the error screen shows the user.
 */
export function serverRequestErrorEntry(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string; renderSource?: string },
  service: { service: string; version: string },
): Record<string, unknown> {
  const described = describe(error) ?? { name: "Error", message: "Unknown error" };
  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest.slice(0, 64)
      : undefined;
  const head = redactSecrets(`${described.name}: ${described.message}`).slice(0, MAX_MESSAGE);
  const stack = described.stack ? cleanStack(described.stack) : undefined;
  const path = redactSecrets(request.path.split(/[?#]/)[0]).slice(0, 300);

  return {
    severity: "ERROR",
    time: new Date().toISOString(),
    message: stack ? (stack.startsWith(described.name) ? stack : `${head}\n${stack}`) : head,
    "@type": REPORTED_ERROR_EVENT,
    serviceContext: service,
    context: {
      httpRequest: { method: request.method, url: path },
      reportLocation: { filePath: context.routePath ?? path, lineNumber: 0, functionName: context.routeType ?? "render" },
    },
    activity: "next.request_error",
    path,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    digest,
  };
}

/**
 * Removes what must never leave the device in a crash report: query strings
 * (reset codes, OAuth codes, signed URLs), tokens, named secrets, emails,
 * phone and card numbers. Mirrors backend/src/shared/logging/redact.ts — the
 * server runs its own copy and is the one that counts; this one keeps the
 * data from being sent at all.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}

// No lookbehind anywhere: a regex literal an engine cannot parse fails the
// whole bundle that contains it, not just this file.
const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ""],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'`()<>]+)[?#][^\s"'`()<>:]*/gi, "$1"],
  [/(^|[\s("'`])(\/[^\s?#"'`()<>]*)[?#][^\s"'`()<>:]*/g, "$1$2"],
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  [
    /([\w-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|session[_-]?id|signature|credential)s?)(["']?\s*[:=]\s*["']?)[^\s"'&,;)}\]]+/gi,
    "$1$2[redacted]",
  ],
  [/\b(otp|code|pass|pin|auth|authorization|cookie|sig)(["']?\s*[:=]\s*["']?)[^\s"'&,;)}\]]+/gi, "$1$2[redacted]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]"],
  [/(^|[^\d:])(?:\d[ -]?){12,18}\d(?![\d:])/g, "$1[number]"],
  [/(^|[^\d:+])(?:\+?91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?![\d:])/g, "$1[phone]"],
  [/\b[a-f0-9]{32,}\b/gi, "[hex]"],
];
