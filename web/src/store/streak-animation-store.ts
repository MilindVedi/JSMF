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
  /** The count the badge "arrives" with — the level it shows in flight. */
  flightToValue: number | null;
  /** Bumped each time the flying badge lands, so the topbar can trigger a
   *  pulse without needing its own phase machine. */
  landedSignal: number;
  /** YYYY-MM-DD today's completion was last celebrated. Remembered in
   *  localStorage (see CELEBRATED_KEY), unlike the rest of this store. Unused while
   *  DEMO_ALWAYS_CELEBRATE_ON_VISIT is on, but wired up for when it's off. */
  celebratedDate: string | null;
  registerTopbarTarget: (el: HTMLElement | null) => void;
  /** Call immediately on completion, before updating the real streak count,
   *  so every consumer can freeze its display before that count changes. */
  beginPending: (fromValue: number, toValue?: number) => void;
  /** Abandons a celebration that will never fly (its source unmounted), so the
   *  topbar does not stay frozen and the next celebration is not refused. */
  cancelPending: () => void;
  /** Call once the badge should actually start visually flying (after
   *  `beginPending`'s caller has waited out its celebratory delay). */
  trigger: (sourceEl: HTMLElement, milestoneHit: number | null) => void;
  notifyLanded: () => void;
  markCelebrated: (date: string) => void;
}

/**
 * The one piece kept across reloads: the day already celebrated. Without it, a
 * student who hit the goal in practice and then refreshed the dashboard would
 * see the whole celebration again. Per-browser and best-effort — storage can
 * be unavailable, and then the worst case is one repeat celebration.
 */
const CELEBRATED_KEY = "jsmf:streak-celebrated";

function readCelebrated(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(CELEBRATED_KEY);
  } catch {
    return null;
  }
}

function writeCelebrated(date: string) {
  try {
    window.localStorage.setItem(CELEBRATED_KEY, date);
  } catch {
    // Storage blocked: the in-memory value still covers this page's lifetime.
  }
}

export const useStreakAnimationStore = create<StreakAnimationState>((set, get) => ({
  phase: "idle",
  sourceRect: null,
  topbarEl: null,
  milestoneHit: null,
  flightFromValue: null,
  flightToValue: null,
  landedSignal: 0,
  celebratedDate: readCelebrated(),
  registerTopbarTarget: (el) => set({ topbarEl: el }),
  beginPending: (fromValue, toValue) => {
    if (get().phase !== "idle") return;
    set({ phase: "pending", flightFromValue: fromValue, flightToValue: toValue ?? fromValue + 1 });
  },
  cancelPending: () => {
    if (get().phase !== "pending") return;
    set({ phase: "idle", flightFromValue: null, flightToValue: null });
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
      flightToValue: null,
      landedSignal: state.landedSignal + 1,
    })),
  markCelebrated: (date) => {
    writeCelebrated(date);
    set({ celebratedDate: date });
  },
}));
