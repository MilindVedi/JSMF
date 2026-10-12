import { configureCore } from "@jsmf/core/config";
import { createAuthSession } from "@jsmf/core/api";
import { createQueryClient } from "@jsmf/core/query";
import { create } from "zustand";
import { API_BASE_URL } from "./env";
import { appStorage } from "./storage";
import { toast } from "./toast";

/**
 * Wires @jsmf/core to the phone, once, before anything renders or requests.
 *
 * - `baseUrl`: the backend directly (there is no same-origin proxy on a phone);
 * - `storage`: the secure store for the refresh token;
 * - `dataSource`: omitted — mobile always talks to the real API adapter;
 * - `onLegalRequired`: bumps a counter the legal gate watches;
 * - `notify`: in-app toasts for failed writes.
 */

/** Bumped whenever the API refuses a request until updated terms are accepted. */
export const useLegalSignal = create<{ nonce: number; bump: () => void }>((set) => ({
  nonce: 0,
  bump: () => set((state) => ({ nonce: state.nonce + 1 })),
}));

configureCore({
  baseUrl: API_BASE_URL,
  storage: appStorage,
  onLegalRequired: () => useLegalSignal.getState().bump(),
  notify: { error: (message) => toast.error(message) },
});

/** One query client for the app's lifetime (defaults shared with web). */
export const queryClient = createQueryClient();

/** The signed-in session — token handling, restore and logout are core's. */
export const authSession = createAuthSession({ queryClient });
