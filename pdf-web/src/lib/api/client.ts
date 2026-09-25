/**
 * The real backend client — not the mock data layer the PYQ app uses.
 *
 * Everything under /admin and the PDF storefront talks to the NestJS API
 * through here. It is deliberately the only place that knows about tokens,
 * refresh, or the API's base URL.
 */

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "/api"
).replace(/\/+$/, "");

const REFRESH_STORAGE_KEY = "jsmf.refreshToken";

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

/**
 * The access token lives in memory only.
 *
 * Putting it in localStorage would leave a valid credential readable by any
 * script on the page for its whole lifetime. In memory it dies with the tab,
 * and the refresh token below is what survives a reload. That refresh token
 * *is* in localStorage, which is the standard trade for a bearer-token SPA
 * (the API is deliberately cookie-free so the same endpoints serve the future
 * Flutter app) — it is single-use and rotates on every exchange, so a stolen
 * one is detectable: using it after the real client already has revokes the
 * whole family server-side.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REFRESH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(REFRESH_STORAGE_KEY, token);
    else window.localStorage.removeItem(REFRESH_STORAGE_KEY);
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
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    setAccessToken(null);
    setStoredRefreshToken(null);
    onSessionLost?.();
    return false;
  }

  const data = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
  };

  setAccessToken(data.accessToken);
  setStoredRefreshToken(data.refreshToken);
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
  /** Sent as-is; the browser sets the multipart boundary itself. */
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

  // Content-Type is set only for JSON. For FormData the browser must set it
  // itself so the multipart boundary is included; setting it manually produces
  // a request the server cannot parse.
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}${path}`, {
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
    throw new ApiError(response.status, extractMessage(parsed, response.status), parsed);
  }

  return parsed as T;
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
