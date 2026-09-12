import { create } from "zustand";

/**
 * Coordinates the "completed goal" flourish across three components that
 * don't otherwise know about each other: the dashboard StreakCard (source),
 * StreakFlyOverlay (the traveling badge, mounted once in the app shell), and
 * Topbar (the landing target). Deliberately not persisted — it's a transient
 * animation cue, not streak data; the streak count itself is updated
 * separately and immediately, so it's correct even if this never fires.
 */
interface StreakAnimationState {
  /** "pending": the streak count has already updated for real, but the
   *  visual flight hasn't started yet (StreakCard's short celebratory
   *  delay). "flying": the badge is actually animating across the screen.
   *  The topbar freezes its displayed number for BOTH — not just "flying" —
   *  because the real count changes the instant "pending" begins, well
   *  before the badge visually detaches. */
  phase: "idle" | "pending" | "flying";
  sourceRect: DOMRect | null;
  topbarEl: HTMLElement | null;
  milestoneHit: number | null;
  /** The streak count from *before* this completion, captured by the caller
   *  when `beginPending` is called (immediately, before the real count is
   *  updated). The topbar freezes its displayed number to this until
   *  landing, so it visibly "arrives" at the new count only then — reading
   *  this from the store (rather than each consumer's own last-known-props
   *  ref) avoids a race where the real streak count (and so that ref)
   *  updates before this is read. */
  flightFromValue: number | null;
  /** Bumped each time the flying badge lands, so the topbar can trigger a
   *  pulse without needing its own phase machine. */
  landedSignal: number;
  /** YYYY-MM-DD today's completion was last celebrated. Deliberately
   *  in-memory only — see the file-level note above. Unused while
   *  DEMO_ALWAYS_CELEBRATE_ON_VISIT is on, but wired up for when it's off. */
  celebratedDate: string | null;
  registerTopbarTarget: (el: HTMLElement | null) => void;
  /** Call immediately on completion, before updating the real streak count,
   *  so every consumer can freeze its display before that count changes. */
  beginPending: (fromValue: number) => void;
  /** Call once the badge should actually start visually flying (after
   *  `beginPending`'s caller has waited out its celebratory delay). */
  trigger: (sourceEl: HTMLElement, milestoneHit: number | null) => void;
  notifyLanded: () => void;
  markCelebrated: (date: string) => void;
}

export const useStreakAnimationStore = create<StreakAnimationState>((set, get) => ({
  phase: "idle",
  sourceRect: null,
  topbarEl: null,
  milestoneHit: null,
  flightFromValue: null,
  landedSignal: 0,
  celebratedDate: null,
  registerTopbarTarget: (el) => set({ topbarEl: el }),
  beginPending: (fromValue) => {
    if (get().phase !== "idle") return;
    set({ phase: "pending", flightFromValue: fromValue });
  },
  trigger: (sourceEl, milestoneHit) => {
    if (get().phase !== "pending") return;
    set({ phase: "flying", sourceRect: sourceEl.getBoundingClientRect(), milestoneHit });
  },
  notifyLanded: () =>
    set((state) => ({
      phase: "idle",
      sourceRect: null,
      flightFromValue: null,
      landedSignal: state.landedSignal + 1,
    })),
  markCelebrated: (date) => set({ celebratedDate: date }),
}));
