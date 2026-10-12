import { getCoreConfig } from "../config";

/**
 * The backend client shared by the PYQ web app and the mobile app. Both talk
 * to the same NestJS API — web through its same-origin `/api` proxy, mobile
 * straight to the backend — and this file is the only place that knows about
 * tokens or refresh. Where requests go and where the refresh token is kept
 * are injected through `configureCore()`.
 */

export const REFRESH_STORAGE_KEY = "jsmf.refreshToken";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The configured API prefix, e.g. `/api` on web. */
export function apiBaseUrl(): string {
  return getCoreConfig().baseUrl;
}

function doFetch(input: string, init?: RequestInit): Promise<Response> {
  // Pulled into a local first so the global fetch is never called with the
  // config object as `this` (browsers reject that as an illegal invocation).
  const impl = getCoreConfig().fetch ?? globalThis.fetch;
  return impl(input, init);
}

/**
 * The access token lives in memory only.
 *
 * Putting it in persistent storage would leave a valid credential readable for
 * its whole lifetime. In memory it dies with the tab (or app process), and the
 * refresh token below is what survives a reload. That refresh token *is*
 * persisted (localStorage on web, the secure store on mobile), which is the
 * standard trade for a bearer-token client (the API is deliberately
 * cookie-free so the same endpoints serve web and mobile) — it is single-use
 * and rotates on every exchange, so a stolen one is detectable: using it after
 * the real client already has revokes the whole family server-side.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return (await getCoreConfig().storage.getItem(REFRESH_STORAGE_KEY)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Persists (or clears) the refresh token. With a synchronous store (web's
 * localStorage) the write has happened by the time this returns its promise.
 */
export async function setStoredRefreshToken(token: string | null): Promise<void> {
  try {
    const { storage } = getCoreConfig();
    if (token) await storage.setItem(REFRESH_STORAGE_KEY, token);
    else await storage.removeItem(REFRESH_STORAGE_KEY);
  } catch {
    // Private browsing or blocked storage: the session simply won't survive a
    // reload, which is a degraded experience rather than a broken one.
  }
}

/**
 * The single in-flight refresh.
 *
 * This is load-bearing, not an optimisation. The backend's refresh tokens are
 * single-use and rotate, and presenting an already-rotated token is treated as
 * a replay — it revokes the entire token family. So if two requests 401 at the
 * same moment and both try to refresh, the second one logs the user out. Every
 * caller therefore awaits the same promise.
 */
let refreshInFlight: Promise<boolean> | null = null;

/** Notifies the session store when the server has ended the session. */
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return false;

  const response = await doFetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    setAccessToken(null);
    await setStoredRefreshToken(null);
    onSessionLost?.();
    return false;
  }

  const data = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
  };

  setAccessToken(data.accessToken);
  await setStoredRefreshToken(data.refreshToken);
  return true;
}

/**
 * The only way anything in the app may exchange a refresh token.
 *
 * Exported because session restore needs it too: React Strict Mode double-fires
 * effects in development, so a restore that called `/auth/refresh` directly
 * would send the same single-use token twice, the server would correctly read
 * the second as a replay, and it would revoke the whole family — logging the
 * user out on every page load. Funnelling every caller through one promise is
 * what makes that impossible rather than merely unlikely.
 */
export function ensureRefreshed(): Promise<boolean> {
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Sent as-is; the platform sets the multipart boundary itself. */
  formData?: FormData;
  /** Skips the bearer header — for login/register. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

async function send<T>(path: string, options: RequestOptions, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {};

  if (!options.anonymous && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  // Content-Type is set only for JSON. For FormData the platform must set it
  // itself so the multipart boundary is included; setting it manually produces
  // a request the server cannot parse.
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await doFetch(`${apiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    signal: options.signal,
  });

  if (response.status === 401 && !options.anonymous && !isRetry) {
    const refreshed = await ensureRefreshed();
    if (refreshed) return send<T>(path, options, true);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    // The server blocks a user who must accept updated terms first; the
    // platform's legal gate is told so through `onLegalRequired`.
    if (response.status === 403 && isLegalAcceptanceRequired(parsed)) {
      getCoreConfig().onLegalRequired?.();
    }
    throw new ApiError(response.status, extractMessage(parsed, response.status), parsed);
  }

  return parsed as T;
}

function isLegalAcceptanceRequired(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && (body as { code?: unknown }).code === "LEGAL_ACCEPTANCE_REQUIRED");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Nest's exception filter returns `message` as a string or, for validation
 * failures, an array of them. Both are surfaced to the user, because "title
 * must be shorter than 200 characters" is far more useful than "Bad Request".
 */
function extractMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;

  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string") return message;
  }

  return `Request failed with status ${status}`;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => send<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => send<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => send<T>(path, { method: "DELETE" }),
  postAnonymous: <T>(path: string, body: unknown) =>
    send<T>(path, { method: "POST", body, anonymous: true }),
  /** For endpoints reached before a session exists, such as checking an invitation. */
  getAnonymous: <T>(path: string, signal?: AbortSignal) =>
    send<T>(path, { signal, anonymous: true }),
  upload: <T>(path: string, formData: FormData) => send<T>(path, { method: "POST", formData }),
};
