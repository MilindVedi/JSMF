import { useMemo } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useStreakStore } from "@/store/streak-store";
import { useStreakAnimationStore } from "@/store/streak-animation-store";
import { usePracticeStore } from "@/store/practice-store";
import { countAttemptsOnDay } from "@/lib/selectors";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import {
  DAILY_QUESTION_TARGET,
  DEMO_ALWAYS_CELEBRATE_ON_VISIT,
  isMilestoneDay,
  nextMilestone,
} from "@/lib/streak-config";
import type { StreakState } from "@/types";

/**
 * Assembles the one StreakState object every streak UI reads from. A real
 * backend would return this shape directly; here it's composed from the
 * mock stores so nothing downstream needs to know the difference.
 */
export function useStreakState(): StreakState {
  const currentStreak = useAuthStore((s) => s.profile.streakDays);
  const bestStreak = useStreakStore((s) => s.bestStreak);
  const celebratedDate = useStreakAnimationStore((s) => s.celebratedDate);
  const sessions = usePracticeStore((s) => s.sessions);

  const dayISO = useClientSnapshot<string | null>(
    () => new Date().toISOString().slice(0, 10),
    null
  );

  const sessionList = useMemo(() => Object.values(sessions), [sessions]);
  const todayProgress = dayISO ? countAttemptsOnDay(sessionList, dayISO) : 0;

  const celebratedToday = DEMO_ALWAYS_CELEBRATE_ON_VISIT ? false : celebratedDate === dayISO;

  return {
    currentStreak,
    bestStreak: Math.max(bestStreak, currentStreak),
    todayProgress,
    dailyTarget: DAILY_QUESTION_TARGET,
    lastCompletedDate: dayISO,
    celebratedToday,
    isMilestone: isMilestoneDay(currentStreak),
    nextMilestone: nextMilestone(currentStreak),
  };
}
