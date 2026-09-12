import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExamId, UserProfile } from "@/types";
import { DEMO_USER } from "@/data/mock/demo-user";
import { safeLocalStorage } from "./persist-storage";
import { usePracticeStore } from "./practice-store";
import { useBookmarksStore } from "./bookmarks-store";
import { useStreakStore } from "./streak-store";
import { useCollectionsStore } from "./collections-store";
import { buildSeedBookmarkIds, buildSeedCollections, buildSeedSessions } from "@/lib/seed-demo-data";

/**
 * Fully mocked authentication. There is no real backend, password hashing,
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
  login: (email: string) => void;
  signup: (name: string, email: string, targetExamId: ExamId) => void;
  logout: () => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  upgradePlan: (planId: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      profile: DEMO_USER,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      login: () => {
        // A returning user: only seed if these stores are still empty (both
        // guard against overwriting anything real internally), never reset.
        // Collections must be built first — some seed sessions reference a
        // seeded collection's id in their filters.
        const seedCollections = buildSeedCollections();
        useCollectionsStore.getState().seedCollections(seedCollections);
        usePracticeStore.getState().seedSessions(buildSeedSessions(seedCollections));
        useBookmarksStore.getState().seedBookmarks(buildSeedBookmarkIds());
        set({ isAuthenticated: true });
      },
      signup: (name, email, targetExamId) => {
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
      logout: () => set({ isAuthenticated: false }),
      updateProfile: (patch) =>
        set((state) => ({ profile: { ...state.profile, ...patch } })),
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
