import { useStreak } from "@/hooks/pyq";
import { useStreakAnimationStore } from "@/store/streak-animation-store";
import { DEMO_ALWAYS_CELEBRATE_ON_VISIT, isMilestoneDay, nextMilestone } from "@/lib/streak-config";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import type { StreakState } from "@/types";

export interface LiveStreakState extends StreakState {
  /** False until the streak has loaded from the data source. */
  loaded: boolean;
  /** Today's answers have reached the daily target. */
  todayDone: boolean;
}

/**
 * The one StreakState object every streak UI reads from, built from the data
 * source's streak summary (`useStreak`). In api mode the server computes it
 * from attempts by India-time day; the mock derives it from browser stores.
 * Whether today's completion has been celebrated stays in memory (see
 * streak-animation-store), and the always-celebrate demo applies only to mock.
 */
export function useStreakState(): LiveStreakState {
  const { data } = useStreak();
  const celebratedDate = useStreakAnimationStore((s) => s.celebratedDate);

  const currentStreak = data?.currentStreak ?? 0;
  const today = data?.today ?? null;
  const demo = DEMO_ALWAYS_CELEBRATE_ON_VISIT && DATA_SOURCE_KIND === "mock";

  return {
    loaded: Boolean(data),
    currentStreak,
    bestStreak: Math.max(data?.longestStreak ?? 0, currentStreak),
    todayProgress: data?.todayCount ?? 0,
    dailyTarget: data?.dailyTarget ?? 10,
    todayDone: data?.todayDone ?? false,
    lastCompletedDate: today,
    celebratedToday: demo ? false : Boolean(today) && celebratedDate === today,
    isMilestone: isMilestoneDay(currentStreak),
    nextMilestone: nextMilestone(currentStreak),
  };
}
