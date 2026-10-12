import type { QueryClient } from "@tanstack/react-query";
import { api, ensureRefreshed, getStoredRefreshToken, setAccessToken, setStoredRefreshToken } from "./client";
import { authApi, type AuthSession, type AuthUser } from "./auth";

/**
 * The signed-in session against the real identity API, shared by web and
 * mobile. Each app keeps its own state container (web: a zustand store,
 * mobile: the same) and only mirrors what these calls return; the token
 * handling, the order of operations and the cache clearing live here so the
 * two apps cannot drift apart.
 *
 * - Tokens: the access token stays in memory, the refresh token goes to the
 *   storage configured with `configureCore` (see ./client.ts).
 * - Cache: every query under `["pyq", "user"]` belongs to one user, so it is
 *   dropped whenever the user changes (sign-in, sign-out).
 * - Restore: goes through the client's single shared refresh. Refresh tokens
 *   are single-use, so a duplicate exchange (React Strict Mode double effects,
 *   two screens restoring at once) would read as replay and revoke the whole
 *   family — `restore` is also single-flight on top of that.
 */

/** The query-key prefix of everything that belongs to the signed-in user. */
const USER_QUERY_KEY = ["pyq", "user"] as const;

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  /** Saved as the PYQ preference; a failure there never fails the signup. */
  targetExamId?: string | null;
}

export interface AuthSessionController {
  /** Stores a session obtained by any route (password, Google, reset) and returns its user. */
  adopt(session: AuthSession): AuthUser;
  login(email: string, password: string): Promise<AuthUser>;
  /** Creates the account, starts the session and records the chosen exam. */
  signup(input: SignupInput): Promise<AuthUser>;
  /** Trades the emailed reset code for a new password and a session. */
  resetPassword(input: { email: string; code: string; password: string }): Promise<AuthUser>;
  /** Trades the single-use code from the Google OAuth callback for a session. */
  googleExchange(code: string): Promise<AuthUser>;
  /**
   * Restores a session from the stored refresh token. Null means signed out —
   * no token, a rejected one, or an unreachable API (the token is then kept,
   * so the next launch signs straight back in).
   */
  restore(): Promise<AuthUser | null>;
  /** Revokes the refresh-token family server-side, then forgets it locally. */
  logout(): Promise<void>;
  /** The account's display name, shared with jsmf.me and the store. */
  rename(name: string): Promise<AuthUser>;
}

export function createAuthSession({ queryClient }: { queryClient: QueryClient }): AuthSessionController {
  const clearUserCache = () => queryClient.removeQueries({ queryKey: USER_QUERY_KEY });

  function adopt(session: AuthSession): AuthUser {
    setAccessToken(session.tokens.accessToken);
    void setStoredRefreshToken(session.tokens.refreshToken);
    clearUserCache();
    return session.user;
  }

  let restoreInFlight: Promise<AuthUser | null> | null = null;

  return {
    adopt,

    login: async (email, password) => adopt(await authApi.login({ email, password })),

    signup: async ({ name, email, password, targetExamId }) => {
      const user = adopt(await authApi.register({ name, email, password }));
      // The account exists either way, so a failure here never fails the
      // signup — the student can still pick the exam on their profile.
      if (targetExamId) await api.put("/pyq/preferences", { targetExamId }).catch(() => undefined);
      return user;
    },

    resetPassword: async (input) => adopt(await authApi.resetPassword(input)),

    googleExchange: async (code) => adopt(await authApi.googleExchange(code)),

    restore: () => {
      restoreInFlight ??= (async () => {
        try {
          if (!(await getStoredRefreshToken()) || !(await ensureRefreshed())) {
            setAccessToken(null);
            return null;
          }
          return await authApi.me();
        } catch {
          setAccessToken(null);
          return null;
        }
      })().finally(() => {
        restoreInFlight = null;
      });
      return restoreInFlight;
    },

    logout: async () => {
      const refreshToken = await getStoredRefreshToken();
      // Revoke server-side first so the refresh-token family is really dead.
      if (refreshToken) await authApi.logout(refreshToken).catch(() => {});
      await setStoredRefreshToken(null);
      clearUserCache();
      setAccessToken(null);
    },

    rename: (name) => authApi.rename(name),
  };
}
