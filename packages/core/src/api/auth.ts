import { api } from "./client";

/**
 * Identity endpoints, copied in spirit from main-web/src/lib/api/auth.ts
 * (apps never import each other's source). Identity is platform-wide: the
 * same account signs in here, on jsmf.me, on the store and in the mobile app.
 *
 * Only HTTP calls live here. Starting Google sign-in is platform-specific (a
 * browser redirect on web, native sign-in on mobile) and stays in each app;
 * both finish with `authApi.googleExchange`.
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

/** The account's profile (GET auth/me/profile) — what this app reads of it. */
export interface AccountProfile {
  name: string;
  /** The contact number with its country code, `+919876543210`, or null. Unverified. */
  mobileE164: string | null;
  /** When the account was created, ISO. */
  memberSince: string;
  /** A link to the profile picture, or null when none is set. */
  avatarUrl: string | null;
}

export interface AuthMethods {
  passwordSignup: boolean;
  google: boolean;
}

export const authApi = {
  login: (input: { email: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/login", input),

  /** Creates the account and starts the session in one call; no email is sent. */
  register: (input: { email: string; name: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/register", input),

  me: () => api.get<AuthUser>("/auth/me"),

  /** The account's display name; the same field jsmf.me and the store show. */
  rename: (name: string) => api.patch<AuthUser>("/auth/me/name", { name }),

  /** The account's profile; the same one jsmf.me and the store show. */
  profile: () => api.get<AccountProfile>("/auth/me/profile"),

  /**
   * The contact number (E.164, or a bare 10-digit Indian mobile); null removes
   * it. Unverified — how we may reach you, never a way to sign in.
   */
  setMobile: (mobileNumber: string | null) => api.patch<AccountProfile>("/auth/me/mobile", { mobileNumber }),

  /** Removes the profile picture. Setting one is `uploadAvatar` (api/uploads). */
  removeAvatar: () => api.delete<void>("/auth/me/avatar"),

  logout: (refreshToken: string) => api.post<void>("/auth/logout", { refreshToken }),

  methods: () => api.getAnonymous<AuthMethods>("/auth/methods"),

  forgotPassword: (input: { email: string }) =>
    api.postAnonymous<CodeIssued>("/auth/password/forgot", input),

  resetPassword: (input: { email: string; code: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/password/reset", input),

  /** Trades the single-use code from the Google OAuth callback for a session. */
  googleExchange: (code: string) => api.postAnonymous<AuthSession>("/auth/google/exchange", { code }),
};
