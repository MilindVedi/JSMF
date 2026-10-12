import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExamId, UserProfile } from "@jsmf/core/domain";
import { DEMO_USER } from "@/data/mock/demo-user";
import { safeLocalStorage } from "./persist-storage";
import { usePracticeStore } from "./practice-store";
import { useBookmarksStore } from "./bookmarks-store";
import { useStreakStore } from "./streak-store";
import { useCollectionsStore } from "./collections-store";
import { buildSeedBookmarkIds, buildSeedCollections, buildSeedSessions } from "@/lib/seed-demo-data";
import { DATA_SOURCE_KIND } from "@/lib/data-source/kind";
import {
  createAuthSession,
  setAccessToken,
  setSessionLostHandler,
  type AuthSession,
  type AuthUser,
} from "@jsmf/core/api";
import { queryClient } from "@/lib/query-client";

/**
 * Authentication, behind one store interface with two implementations picked
 * by NEXT_PUBLIC_DATA_SOURCE: the real identity API (`api`), or the original
 * fully mocked flow below (`mock`).
 *
 * Mock mode — fully mocked authentication. There is no real backend, password hashing,
 * session, or JWT here — signup/login accept any input and simply mark the
 * demo profile as authenticated. See docs/02-v1-scope.md for what this
 * becomes in the real V1.
 *
 * Signup and login deliberately behave differently, matching what each
 * implies in a real product: signup is a brand-new account (so the profile
 * and every other store — sessions, bookmarks, best streak — are reset to a
 * genuinely empty slate, even if this browser previously held seeded/real
 * data from an earlier login), while login is a *returning* user, so it
 * seeds plausible history if the stores don't already hold any (their own
 * seed functions no-op otherwise, so real progress is never overwritten).
 * This is also how the mock demonstrates both the first-time onboarding
 * dashboard (sign up) and the populated/mature dashboard (log in) on demand
 * — see components/dashboard/onboarding-dashboard.tsx.
 */
interface AuthState {
  isAuthenticated: boolean;
  profile: UserProfile;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, targetExamId: ExamId) => Promise<void>;
  logout: () => Promise<void>;
  /** Stores a session obtained elsewhere (Google sign-in, password reset). */
  adopt: (session: AuthSession) => void;
  /** Restores a session after a reload; a no-op in mock mode. */
  restore: () => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => void;
  /** Saves the display name (server-side in api mode). */
  rename: (name: string) => Promise<void>;
  upgradePlan: (planId: string) => void;
}

const createMockAuthStore = () => create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      profile: DEMO_USER,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      login: async () => {
        // A returning user: only seed if these stores are still empty (both
        // guard against overwriting anything real internally), never reset.
        // Collections must be built first — some seed sessions reference a
        // seeded collection's id in their filters.
        const seedCollections = buildSeedCollections();
        useCollectionsStore.getState().seedCollections(seedCollections);
        usePracticeStore.getState().seedSessions(buildSeedSessions(seedCollections));
        useBookmarksStore.getState().seedBookmarks(buildSeedBookmarkIds());
        set({ isAuthenticated: true, profile: DEMO_USER });
      },
      signup: async (name, email, _password, targetExamId) => {
        // A brand-new account: hard-reset every other store so the
        // onboarding dashboard is always genuinely empty, regardless of
        // whatever this browser held from an earlier login/session.
        usePracticeStore.getState().resetSessions();
        useBookmarksStore.getState().resetBookmarks();
        useStreakStore.getState().resetBestStreak();
        useCollectionsStore.getState().resetCollections();
        set(() => ({
          isAuthenticated: true,
          profile: {
            ...DEMO_USER,
            name: name || DEMO_USER.name,
            email: email || DEMO_USER.email,
            targetExamId,
            joinedAt: new Date().toISOString(),
            streakDays: 0,
            lastActiveAt: new Date().toISOString(),
          },
        }));
      },
      logout: async () => {
        set({ isAuthenticated: false });
      },
      adopt: () => set({ isAuthenticated: true, profile: DEMO_USER }),
      restore: async () => {},
      updateProfile: (patch) =>
        set((state) => ({ profile: { ...state.profile, ...patch } })),
      rename: async (name) => {
        set((state) => ({ profile: { ...state.profile, name } }));
      },
      upgradePlan: (planId) =>
        set((state) => ({ profile: { ...state.profile, currentPlanId: planId } })),
    }),
    {
      name: "jsmf:auth",
      storage: safeLocalStorage<AuthState>(),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      // Bumped when DEMO_USER's mock defaults change, so a browser that
      // already persisted an older profile (e.g. an old currentPlanId) picks
      // up the new default instead of being stuck on whatever it saved before.
      version: 1,
      migrate: (persisted) => {
        const state = persisted as AuthState;
        return { ...state, profile: { ...DEMO_USER, ...state.profile, currentPlanId: DEMO_USER.currentPlanId } };
      },
    }
  )
);

// ---------------------------------------------------------------------------
// API mode — the shared identity API, same tokens and storage as jsmf.me.
// The session itself (token handling, restore, logout, cache clearing) is
// @jsmf/core's `createAuthSession`, shared with the mobile app; this store
// only mirrors its results into the profile the screens read. The browser
// storage it uses is wired in src/lib/core.ts.
// ---------------------------------------------------------------------------

function profileFrom(user: AuthUser, previous?: UserProfile): UserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? "",
    // Server-side in pyq preferences; screens read it from usePreferences.
    targetExamId: previous?.id === user.id ? previous.targetExamId : "neet-pg",
    // Not on the token; /profile fetches the real date when it is shown.
    joinedAt: previous?.id === user.id ? previous.joinedAt : "",
    // Unused in api mode: plan badges read the server's access (usePlanLabel).
    currentPlanId: "free",
    streakDays: previous?.id === user.id ? previous.streakDays : 0,
    lastActiveAt: new Date().toISOString(),
  };
}

const createApiAuthStore = () =>
  create<AuthState>()((set, get) => {
    const session = createAuthSession({ queryClient });

    function signedIn(user: AuthUser) {
      set({ isAuthenticated: true, hasHydrated: true, profile: profileFrom(user, get().profile) });
    }

    function signedOut() {
      setAccessToken(null);
      set({ isAuthenticated: false, hasHydrated: true });
    }

    return {
      isAuthenticated: false,
      profile: { ...DEMO_USER, id: "", name: "", email: "", currentPlanId: "free", streakDays: 0 },
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      adopt: (auth) => signedIn(session.adopt(auth)),
      login: async (email, password) => signedIn(await session.login(email, password)),
      signup: async (name, email, password, targetExamId) => {
        // The exam chosen on the form is the PYQ preference; core saves it
        // once the account exists and never fails the signup over it.
        signedIn(await session.signup({ name, email, password, targetExamId }));
        set((state) => ({ profile: { ...state.profile, targetExamId } }));
      },
      logout: async () => {
        await session.logout();
        signedOut();
      },
      /**
       * The access token is memory-only, so a reload leaves just the refresh
       * token. Core restores it through the client's single shared refresh
       * (single-use tokens: a duplicate exchange would revoke the family).
       */
      restore: async () => {
        if (get().hasHydrated) return;
        const user = await session.restore();
        if (user) signedIn(user);
        else signedOut();
      },
      updateProfile: (patch) => set((state) => ({ profile: { ...state.profile, ...patch } })),
      rename: async (name) => {
        const user = await session.rename(name);
        set((state) => ({ profile: { ...state.profile, name: user.name } }));
      },
      upgradePlan: (planId) => set((state) => ({ profile: { ...state.profile, currentPlanId: planId } })),
    };
  });

export const useAuthStore = DATA_SOURCE_KIND === "api" ? createApiAuthStore() : createMockAuthStore();

if (DATA_SOURCE_KIND === "api") {
  /** The API client drops the session when the server rejects a refresh. */
  setSessionLostHandler(() => useAuthStore.setState({ isAuthenticated: false }));
}
