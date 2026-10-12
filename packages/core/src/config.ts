import type { PyqDataSource } from "./data-source/types";

/**
 * Everything platform-specific that core needs, handed in once at startup by
 * the app (web: src/lib/core.ts; mobile: its own entry). Core itself never
 * touches `window`, `localStorage`, `process.env` or a router, so the same
 * code runs in the Next.js app and in React Native.
 */

/**
 * Durable key/value storage for the refresh token. Web passes a guarded
 * `localStorage`; mobile passes expo-secure-store. Sync or async both work —
 * core always awaits. Implementations may throw; core treats a throw as
 * "nothing stored" / "not saved", the same as blocked browser storage.
 */
export interface KeyValueStore {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** How core surfaces a failed write to the user (web: a sonner toast). */
export interface CoreNotifier {
  error(message: string): void;
}

export interface CoreConfig {
  /**
   * Prefix for every API request, with no trailing slash. Web: `/api` (the
   * same-origin proxy in src/middleware.ts). Mobile: the backend's absolute
   * URL, e.g. `https://api.example.com/api`.
   */
  baseUrl: string;
  /** Where the refresh token survives restarts. */
  storage: KeyValueStore;
  /** The PYQ data port the hooks use. Defaults to the API adapter. */
  dataSource?: PyqDataSource;
  /**
   * Called when the server refuses a request until updated legal terms are
   * accepted (403 LEGAL_ACCEPTANCE_REQUIRED). Web re-dispatches it as a window
   * event that the legal gate listens to.
   */
  onLegalRequired?: () => void;
  /** Error messages from writes (flag, bookmark, collections). Defaults to a no-op. */
  notify?: CoreNotifier;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

let config: CoreConfig | null = null;

/** Call once, before the first request or hook render. Calling again replaces the config. */
export function configureCore(next: CoreConfig): void {
  config = { ...next, baseUrl: next.baseUrl.replace(/\/+$/, "") };
}

export function getCoreConfig(): CoreConfig {
  if (!config) {
    throw new Error("@jsmf/core: configureCore() must be called before using the API client or hooks.");
  }
  return config;
}

export function isCoreConfigured(): boolean {
  return config !== null;
}
