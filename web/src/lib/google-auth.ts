import { authApi } from "@jsmf/core/api";
import { API_BASE_URL } from "@/lib/core";

const OAUTH_NEXT_KEY = "jsmf.pyq.oauthNext";

/**
 * Google sign-in, the browser half. The API redirects to Google and back to
 * /auth/callback with a single-use code, which the callback page exchanges
 * over POST (`authApi.googleExchange`, in @jsmf/core). The callback URL must
 * be listed in the API's OAUTH_ALLOWED_REDIRECTS. Web-only: it navigates the
 * window; the mobile app signs in natively.
 */
export const googleAuth = {
  callbackUrl(): string {
    return `${window.location.origin}/auth/callback`;
  },

  start(options: { next?: string } = {}): void {
    try {
      if (options.next) sessionStorage.setItem(OAUTH_NEXT_KEY, options.next);
      else sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      // Blocked storage: sign-in still works, it just lands on the dashboard.
    }
    const params = new URLSearchParams({ redirect: googleAuth.callbackUrl() });
    // A full navigation to the API (via the /api proxy), which redirects on to Google.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${API_BASE_URL}/auth/google/start?${params.toString()}`;
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

  exchange: (code: string) => authApi.googleExchange(code),
};
