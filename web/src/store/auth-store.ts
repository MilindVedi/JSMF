import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExamId, UserProfile } from "@/types";
import { DEMO_USER } from "@/data/mock/demo-user";
import { safeLocalStorage } from "./persist-storage";

/**
 * Fully mocked authentication. There is no real backend, password hashing,
 * session, or JWT here — signup/login accept any input and simply mark the
 * demo profile as authenticated. See docs/02-v1-scope.md for what this
 * becomes in the real V1.
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
      login: () =>
        set({
          isAuthenticated: true,
        }),
      signup: (name, email, targetExamId) =>
        set((state) => ({
          isAuthenticated: true,
          profile: {
            ...state.profile,
            name: name || state.profile.name,
            email: email || state.profile.email,
            targetExamId,
            joinedAt: new Date().toISOString(),
          },
        })),
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
    }
  )
);
