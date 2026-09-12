import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeLocalStorage } from "./persist-storage";

/**
 * Best streak persists independently of the current streak (which lives on
 * UserProfile) because it must never decrease when a streak resets — it's a
 * historical record, not a live counter. `celebratedDate`/`lastCompletedDate`
 * are intentionally NOT persisted: whether today's goal has already been
 * celebrated is the kind of thing a real backend would answer per-session,
 * and keeping it in-memory here is also what makes the demo replay the
 * completion animation on every visit (see DEMO_ALWAYS_CELEBRATE_ON_VISIT).
 */
interface StreakStoreState {
  bestStreak: number;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  recordStreak: (currentStreak: number) => void;
  /** Hard-clears the historical best — see `resetSessions` in
   *  practice-store for why a fresh signup needs this. */
  resetBestStreak: () => void;
}

export const useStreakStore = create<StreakStoreState>()(
  persist(
    (set) => ({
      bestStreak: 0,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      recordStreak: (currentStreak) =>
        set((state) => ({ bestStreak: Math.max(state.bestStreak, currentStreak) })),
      resetBestStreak: () => set({ bestStreak: 0 }),
    }),
    {
      name: "jsmf:streak",
      storage: safeLocalStorage<StreakStoreState>(),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
