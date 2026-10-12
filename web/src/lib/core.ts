import { toast } from "sonner";
import { configureCore, type KeyValueStore } from "@jsmf/core/config";
import { dataSource } from "@/lib/data-source";

/**
 * Wires @jsmf/core (packages/core) to the browser, once. Imported for its side
 * effect by the providers and by the web hooks layer (`@/hooks/pyq`), so it
 * has run before any hook renders or any request is made.
 *
 * What web injects:
 * - `baseUrl`: the same-origin `/api` proxy (src/middleware.ts forwards it to
 *   the NestJS backend), so the browser never needs CORS;
 * - `storage`: localStorage for the refresh token, guarded for server
 *   rendering and blocked storage;
 * - `dataSource`: the API adapter, or the demo mock (NEXT_PUBLIC_DATA_SOURCE);
 * - `onLegalRequired`: re-fired as a window event the legal gate listens to;
 * - `notify`: sonner toasts for failed writes.
 */

/** Where the browser reaches the API: this app's own proxy. */
export const API_BASE_URL = "/api";

/** Fired on `window` when an API call is refused until terms are accepted. */
export const LEGAL_REQUIRED_EVENT = "jsmf:legal-required";

const browserStorage: KeyValueStore = {
  getItem: (key) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};

configureCore({
  baseUrl: API_BASE_URL,
  storage: browserStorage,
  dataSource,
  onLegalRequired: () => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LEGAL_REQUIRED_EVENT));
  },
  notify: { error: (message) => toast.error(message) },
});
