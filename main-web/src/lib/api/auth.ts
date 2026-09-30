import { api } from "./client";
import type { AuthSession } from "./types";

const BASE_URL = "/api";
const OAUTH_NEXT_KEY = "jsmf.main.oauthNext";

/**
 * Google sign-in, the only way into an account on the main website.
 *
 * Identity is platform-wide: this is the same API and the same account as the
 * PDF store, so signing in here and later on store.jsmf.me lands in one
 * account — which is how the planner that comes with a seat shows up there.
 * The callback URL must be in the API's OAUTH_ALLOWED_REDIRECTS.
 */
export const googleAuth = {
  callbackUrl(): string {
    return `${window.location.origin}/auth/callback`;
  },

  start(next?: string): void {
    try {
      if (next) sessionStorage.setItem(OAUTH_NEXT_KEY, next);
      else sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      // Blocked storage: sign-in still works, it just lands on the home page.
    }

    const params = new URLSearchParams({ redirect: googleAuth.callbackUrl() });
    // A full navigation, not a router push: this is the API (via the /api
    // proxy), which redirects the browser on to Google's consent screen.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${BASE_URL}/auth/google/start?${params.toString()}`;
  },

  consumeNext(): string | null {
    try {
      const next = sessionStorage.getItem(OAUTH_NEXT_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_KEY);
      return next;
    } catch {
      return null;
    }
  },

  exchange: (code: string) => api.postAnonymous<AuthSession>("/auth/google/exchange", { code }),
};
