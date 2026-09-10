import { createJSONStorage, type StateStorage } from "zustand/middleware";

/**
 * A localStorage-backed storage for Zustand's `persist` middleware that is
 * safe to import in a module evaluated during Next.js server rendering.
 * Server evaluation never touches the real `localStorage` global (which
 * doesn't exist in Node) — it gets a no-op storage instead. On the client,
 * the same module is re-evaluated in the browser where `window` exists, so
 * it transparently uses real `localStorage`.
 */
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function safeLocalStorage<S>() {
  return createJSONStorage<S>(() =>
    typeof window === "undefined" ? noopStorage : window.localStorage
  );
}
