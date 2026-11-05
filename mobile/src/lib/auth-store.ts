import { create } from "zustand";
import { setSessionLostHandler, type AuthSession, type AuthUser, type SignupInput } from "@jsmf/core/api";
import { authSession } from "./core";

/**
 * The app's view of the signed-in account. Every call goes through core's
 * `createAuthSession` (the same session logic web uses); this store only
 * mirrors the result for the screens and the navigation guard.
 */
type AuthStatus = "restoring" | "signed-in" | "signed-out";

/** Screens never worth returning to after signing in again. */
const NO_RETURN = /^\/(sign-in|sign-up|forgot-password|reset-password|auth\/|$)/;

/**
 * Where to send the student after they sign in again, if the session was lost
 * mid-use (web's /login?next=). Same rule as web's safeNext: an in-app path
 * only, never "//host".
 */
export function returnPathFor(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || NO_RETURN.test(path)) return null;
  return path;
}

/** The screen the signed-in student is on, kept by the root layout. */
let lastSignedInPath: string | null = null;

/**
 * Called by the root layout on every route change. Remembers the signed-in
 * screen, and spends `returnTo` once the student has landed on a real screen
 * after signing in again — not before, or the redirect would find it gone.
 */
export function trackSignedInPath(path: string): void {
  const { status, returnTo } = useAuthStore.getState();
  if (status !== "signed-in") return;
  lastSignedInPath = path;
  if (returnTo && returnPathFor(path)) useAuthStore.setState({ returnTo: null });
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Set when the session is lost mid-use; read by the post-sign-in redirect (see trackSignedInPath). */
  returnTo: string | null;
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  resetPassword: (input: { email: string; code: string; password: string }) => Promise<void>;
  googleExchange: (code: string) => Promise<void>;
  adopt: (session: AuthSession) => void;
  logout: () => Promise<void>;
  rename: (name: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => {
  const signedIn = (user: AuthUser) => set({ status: "signed-in", user });
  return {
    status: "restoring",
    user: null,
    returnTo: null,
    restore: async () => {
      if (get().status !== "restoring") return;
      const user = await authSession.restore();
      if (get().status !== "restoring") return;
      if (user) signedIn(user);
      else set({ status: "signed-out", user: null });
    },
    login: async (email, password) => signedIn(await authSession.login(email, password)),
    signup: async (input) => signedIn(await authSession.signup(input)),
    resetPassword: async (input) => signedIn(await authSession.resetPassword(input)),
    googleExchange: async (code) => signedIn(await authSession.googleExchange(code)),
    adopt: (session) => signedIn(authSession.adopt(session)),
    logout: async () => {
      await authSession.logout();
      // Signing out on purpose returns nowhere.
      lastSignedInPath = null;
      set({ status: "signed-out", user: null, returnTo: null });
    },
    rename: async (name) => {
      const user = await authSession.rename(name);
      set((state) => ({ user: state.user ? { ...state.user, name: user.name } : user }));
    },
  };
});

/** The API client drops the session when the server rejects a refresh. */
setSessionLostHandler(() => {
  const returnTo = returnPathFor(lastSignedInPath);
  lastSignedInPath = null;
  useAuthStore.setState({ status: "signed-out", user: null, returnTo });
});
