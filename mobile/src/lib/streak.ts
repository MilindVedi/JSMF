import { create } from "zustand";
import { isMilestoneDay, nextMilestone, type StreakState } from "@jsmf/core/domain";
import { useStreak } from "@jsmf/core/hooks";
import { readStored, writeStored } from "./storage";

/**
 * Coordinates the "daily goal reached" flourish across components that do not
 * know about each other — the same design as web's streak-animation-store:
 * the source (home StreakCard, or the goal celebrator mid-practice), the
 * flying badge (mounted once at the root) and the header chip it lands on.
 * The count itself is the server's and is right whether or not this plays.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StreakAnimationState {
  /** "pending": the count has changed but the badge has not left yet; the chip freezes for both. */
  phase: "idle" | "pending" | "flying";
  sourceRect: Rect | null;
  milestoneHit: number | null;
  /** The count from before this completion; the chip shows it until landing. */
  flightFromValue: number | null;
  landedSignal: number;
  /** YYYY-MM-DD already celebrated, remembered across launches. */
  celebratedDate: string | null;
  /** Measures the header chip currently on screen, if any. */
  measureTarget: (() => Promise<Rect | null>) | null;
  registerTarget: (measure: (() => Promise<Rect | null>) | null) => void;
  beginPending: (fromValue: number) => void;
  trigger: (sourceRect: Rect | null, milestoneHit: number | null) => void;
  notifyLanded: () => void;
  markCelebrated: (date: string) => void;
}

const CELEBRATED_KEY = "jsmf.streakCelebrated";

export const useStreakAnimationStore = create<StreakAnimationState>((set, get) => ({
  phase: "idle",
  sourceRect: null,
  milestoneHit: null,
  flightFromValue: null,
  landedSignal: 0,
  celebratedDate: null,
  measureTarget: null,
  registerTarget: (measure) => set({ measureTarget: measure }),
  beginPending: (fromValue) => {
    if (get().phase !== "idle") return;
    set({ phase: "pending", flightFromValue: fromValue });
  },
  trigger: (sourceRect, milestoneHit) => {
    if (get().phase !== "pending") return;
    set({ phase: "flying", sourceRect, milestoneHit });
  },
  notifyLanded: () =>
    set((state) => ({ phase: "idle", sourceRect: null, flightFromValue: null, landedSignal: state.landedSignal + 1 })),
  markCelebrated: (date) => {
    void writeStored(CELEBRATED_KEY, date);
    set({ celebratedDate: date });
  },
}));

/** Loads the remembered celebration day; called once at startup. */
export async function loadCelebratedDate(): Promise<void> {
  const stored = await readStored(CELEBRATED_KEY);
  if (stored && !useStreakAnimationStore.getState().celebratedDate) {
    useStreakAnimationStore.setState({ celebratedDate: stored });
  }
}

export interface LiveStreakState extends StreakState {
  /** False until the streak has loaded. */
  loaded: boolean;
  /** Today's answers have reached the daily target. */
  todayDone: boolean;
}

/** The one StreakState every streak UI reads — web's useStreakState, api mode. */
export function useStreakState(): LiveStreakState {
  const { data } = useStreak();
  const celebratedDate = useStreakAnimationStore((s) => s.celebratedDate);
  const currentStreak = data?.currentStreak ?? 0;
  const today = data?.today ?? null;
  return {
    loaded: Boolean(data),
    currentStreak,
    bestStreak: Math.max(data?.longestStreak ?? 0, currentStreak),
    todayProgress: data?.todayCount ?? 0,
    dailyTarget: data?.dailyTarget ?? 10,
    todayDone: data?.todayDone ?? false,
    lastCompletedDate: today,
    celebratedToday: Boolean(today) && celebratedDate === today,
    isMilestone: isMilestoneDay(currentStreak),
    nextMilestone: nextMilestone(currentStreak),
  };
}
