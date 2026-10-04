import { api } from "./client";

/**
 * Identity endpoints, copied in spirit from main-web/src/lib/api/auth.ts
 * (apps never import each other's source). Identity is platform-wide: the
 * same account signs in here, on jsmf.me and on the store.
 */

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  roles: string[];
}

export interface AuthSession {
  user: AuthUser;
  tokens: { accessToken: string; refreshToken: string };
}

export interface CodeIssued {
  channel: string;
  expiresInMinutes: number;
}

export interface AuthMethods {
  passwordSignup: boolean;
  google: boolean;
}

const BASE_URL = "/api";
const OAUTH_NEXT_KEY = "jsmf.pyq.oauthNext";

export const authApi = {
  login: (input: { email: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/login", input),

  /** Creates the account and starts the session in one call; no email is sent. */
  register: (input: { email: string; name: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/register", input),

  me: () => api.get<AuthUser>("/auth/me"),

  logout: (refreshToken: string) => api.post<void>("/auth/logout", { refreshToken }),

  methods: () => api.getAnonymous<AuthMethods>("/auth/methods"),

  forgotPassword: (input: { email: string }) =>
    api.postAnonymous<CodeIssued>("/auth/password/forgot", input),

  resetPassword: (input: { email: string; code: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/password/reset", input),
};

/**
 * Google sign-in. The API redirects to Google and back to /auth/callback with
 * a single-use code, which the callback page exchanges over POST. The callback
 * URL must be listed in the API's OAUTH_ALLOWED_REDIRECTS.
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
