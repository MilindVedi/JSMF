/**
 * Single source of truth for the streak feature's tuning knobs — level
 * thresholds, milestone days, and the daily question target. Nothing in the
 * UI should hardcode a day count or a color for a streak tier; it should
 * read from here, so product can retune the curve without touching
 * components.
 */

export interface StreakLevelConfig {
  id: string;
  label: string;
  /** Inclusive lower bound in consecutive days. */
  minDays: number;
  /** CSS color (any valid value, incl. `var(--token)`) used for the flame
   *  icon, ring, and glow at this level. */
  accent: string;
  /** 0 = no glow, higher = larger/more opaque glow. Purely a multiplier the
   *  presentational components scale their blur/opacity by. */
  glowIntensity: 0 | 1 | 2 | 3 | 4;
  /** Whether the flame/badge idles with a slow breathing pulse at this level. */
  idlePulse: boolean;
}

// Ordered ascending by minDays — getStreakLevel relies on this. Each tier has
// its own distinct accent (see the --streak-* tokens in globals.css) so the
// badge visibly changes color as the streak grows, not just its glow.
export const STREAK_LEVELS: StreakLevelConfig[] = [
  { id: "new", label: "Getting started", minDays: 0, accent: "var(--muted-foreground)", glowIntensity: 0, idlePulse: false },
  { id: "warming", label: "Warming up", minDays: 3, accent: "var(--streak-warming)", glowIntensity: 1, idlePulse: false },
  { id: "hot", label: "On a roll", minDays: 7, accent: "var(--streak-hot)", glowIntensity: 2, idlePulse: false },
  { id: "blazing", label: "Blazing", minDays: 14, accent: "var(--streak-blazing)", glowIntensity: 3, idlePulse: true },
  { id: "legendary", label: "Legendary", minDays: 30, accent: "var(--streak-legendary)", glowIntensity: 4, idlePulse: true },
  { id: "elite", label: "Elite", minDays: 45, accent: "var(--streak-45)", glowIntensity: 4, idlePulse: true },
  { id: "master", label: "Master", minDays: 60, accent: "var(--streak-60)", glowIntensity: 4, idlePulse: true },
  { id: "grandmaster", label: "Grandmaster", minDays: 90, accent: "var(--streak-90)", glowIntensity: 4, idlePulse: true },
  { id: "mythic", label: "Mythic", minDays: 120, accent: "var(--streak-120)", glowIntensity: 4, idlePulse: true },
];

/** Days at which a stronger, but still restrained, celebration plays. */
export const STREAK_MILESTONES: number[] = [7, 14, 30, 50, 100];

export const DAILY_QUESTION_TARGET = 10;

/**
 * Demo-only: the frontend has no backend to tell it "today's questions are
 * done", so every dashboard visit simulates just having hit the daily goal,
 * flipping this back to `false` restores the real, persisted once-per-day
 * gating already implemented in useStreakState (see lastCompletedDate /
 * celebratedDate there) — no other code needs to change.
 */
export const DEMO_ALWAYS_CELEBRATE_ON_VISIT = true;

export function getStreakLevel(days: number): StreakLevelConfig {
  let current = STREAK_LEVELS[0];
  for (const level of STREAK_LEVELS) {
    if (days >= level.minDays) current = level;
  }
  return current;
}

export function isMilestoneDay(days: number): boolean {
  return STREAK_MILESTONES.includes(days);
}

export function nextMilestone(days: number): number | null {
  return STREAK_MILESTONES.find((m) => m > days) ?? null;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
