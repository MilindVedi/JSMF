import { create } from "zustand";
import { setSessionLostHandler, type AuthSession, type AuthUser, type SignupInput } from "@jsmf/core/api";
import { authSession } from "./core";

/**
 * The app's view of the signed-in account. Every call goes through core's
 * `createAuthSession` (the same session logic web uses); this store only
 * mirrors the result for the screens and the navigation guard.
 */
type AuthStatus = "restoring" | "signed-in" | "signed-out";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
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
      set({ status: "signed-out", user: null });
    },
    rename: async (name) => {
      const user = await authSession.rename(name);
      set((state) => ({ user: state.user ? { ...state.user, name: user.name } : user }));
    },
  };
});

/** The API client drops the session when the server rejects a refresh. */
setSessionLostHandler(() => useAuthStore.setState({ status: "signed-out", user: null }));
