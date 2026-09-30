"use client";

import { create } from "zustand";
import {
  api,
  ensureRefreshed,
  getStoredRefreshToken,
  setAccessToken,
  setSessionLostHandler,
  setStoredRefreshToken,
} from "@/lib/api/client";
import type { AuthSession, AuthUser } from "@/lib/api/types";

/**
 * The signed-in session, against the shared identity API. The same logic as
 * pdf-web's store, minus password login: the main website signs in with
 * Google only. See pdf-web/src/store/session-store.ts for the reasoning behind
 * the refresh deduplication, which matters just as much here.
 */
interface SessionState {
  user: AuthUser | null;
  /** False until the initial refresh-from-storage attempt has finished. */
  ready: boolean;
  /** Stores a session produced by Google sign-in or an accepted invitation. */
  adopt: (session: AuthSession) => AuthUser;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  user: null,
  ready: false,

  /**
   * Adopts a session obtained outside the password flow — Google sign-in, or
   * accepting an admin invitation.
   *
   * Those flows call the API directly (they have their own multi-step shapes
   * that do not fit `login`), but the resulting tokens must be stored in
   * exactly the same place, so this is the one way in.
   */
  adopt(session: AuthSession) {
    setAccessToken(session.tokens.accessToken);
    setStoredRefreshToken(session.tokens.refreshToken);
    set({ user: session.user, ready: true });
    return session.user;
  },

  async logout() {
    const refreshToken = getStoredRefreshToken();

    // Tell the server first so the refresh-token family is actually revoked;
    // clearing only the client would leave a usable token in a stolen backup.
    if (refreshToken) {
      await api.post("/auth/logout", { refreshToken }).catch(() => {
        // Already invalid server-side — the local clear below is what matters.
      });
    }

    setAccessToken(null);
    setStoredRefreshToken(null);
    set({ user: null });
  },

  /**
   * Called on mount. The access token is memory-only, so after a reload the
   * only thing left is the refresh token — exchanging it is what makes a page
   * refresh look like a still-logged-in session.
   *
   * Deduplicated twice over, and both layers are load-bearing. Refresh tokens
   * are single-use and rotate; presenting one twice is indistinguishable from
   * a stolen token being replayed, so the server revokes the entire family.
   * React Strict Mode double-invokes effects in development, and several
   * components may mount at once in production, so `restore` guards itself
   * with an in-flight promise *and* exchanges through the API client's single
   * shared refresh rather than issuing its own.
   */
  restore() {
    restoreInFlight ??= (async () => {
      if (get().ready) return;

      try {
        if (!getStoredRefreshToken()) {
          set({ ready: true });
          return;
        }

        const refreshed = await ensureRefreshed();

        if (!refreshed) {
          set({ user: null, ready: true });
          return;
        }

        try {
          set({ user: await api.get<AuthUser>("/auth/me"), ready: true });
        } catch {
          setAccessToken(null);
          setStoredRefreshToken(null);
          set({ user: null, ready: true });
        }
      } catch {
        // A *thrown* refresh — the API unreachable, a CORS rejection, the dev
        // server mid-restart — rather than one that merely answered "no".
        //
        // This has to leave `ready` true. `ready` does not mean "signed in", it
        // means "we have finished finding out", and every gated surface spins
        // until it flips: the library, the product page's buy button, and the
        // header's whole sign-in area. Leaving it false turned a momentary
        // network blip into a page that loads forever and cannot recover on its
        // own, because nothing retries and the thrown promise was discarded by
        // the `void restore()` at each call site. Treating it as signed-out is
        // recoverable — the refresh token is still in storage, so the next load
        // signs the user straight back in.
        setAccessToken(null);
        set({ user: null, ready: true });
      }
    })().finally(() => {
      restoreInFlight = null;
    });

    return restoreInFlight;
  },
}));

/** Guards against two components restoring the same session concurrently. */
let restoreInFlight: Promise<void> | null = null;

/** Lets the API client drop the session when the server rejects a refresh. */
setSessionLostHandler(() => {
  useSessionStore.setState({ user: null });
});

