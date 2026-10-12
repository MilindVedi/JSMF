"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { StreakEmbers } from "@/components/streak/streak-embers";
import { StreakFlame } from "@/components/streak/streak-flame";
import { isApiDataSource, useRefreshStreak } from "@/hooks/pyq";
import { useStreakState } from "@/lib/use-streak-state";
import { getStreakLevel, isMilestoneDay } from "@jsmf/core/domain";
import { useStreakAnimationStore } from "@/store/streak-animation-store";

/** How long the badge celebrates in place before it flies to the topbar. */
const HOLD_MS = 700;
/** Without a topbar chip to fly to (the practice screen), how long it stays. */
const IN_PLACE_MS = 2200;

/**
 * Celebrates the daily goal the moment it is reached, wherever the student is
 * — usually mid-practice, on the answer that crosses the target — instead of
 * only when they next open the dashboard. A badge pops up at the bottom of the
 * screen and flies into the topbar streak chip, through the same
 * StreakFlyOverlay the dashboard card uses.
 *
 * Fires only on a live false → true change of `todayDone` seen while mounted,
 * so loading a page on a day already completed never replays it. The
 * dashboard's StreakCard handles its own page; `markCelebrated` keeps the two
 * from both firing on one day. Api mode only — the mock demo celebrates on
 * every dashboard visit by design.
 */
// `inPlace`: the practice screen has no topbar streak chip, so the badge celebrates
// where it is and fades instead of flying to a target that is not on screen.
export function StreakGoalCelebrator({ inPlace = false }: { inPlace?: boolean }) {
  const pathname = usePathname();
  const streak = useStreakState();
  const beginPending = useStreakAnimationStore((s) => s.beginPending);
  const cancelPending = useStreakAnimationStore((s) => s.cancelPending);
  const triggerFly = useStreakAnimationStore((s) => s.trigger);
  const markCelebrated = useStreakAnimationStore((s) => s.markCelebrated);
  const refreshStreak = useRefreshStreak();

  const [badgeDays, setBadgeDays] = useState<number | null>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const wasDone = useRef<boolean | null>(null);
  // The sequence's timers outlive any one run of the effect below: a streak
  // refetch mid-celebration must not cancel the hide timer and strand the
  // badge on screen. They are cleared only when this component unmounts.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      // Unmounted before the badge flew: release the topbar's frozen count.
      cancelPending();
    },
    [cancelPending]
  );

  useEffect(() => {
    if (!isApiDataSource || !streak.loaded) return;
    const previous = wasDone.current;
    wasDone.current = streak.todayDone;
    if (previous !== false || !streak.todayDone || streak.celebratedToday) return;
    if (pathname === "/dashboard") return;

    // The server counts today in the streak from the day's first answer, so
    // the topbar already shows today's count: it stays at that value through
    // the flight and pulses as the badge lands, rather than dipping by one.
    const days = Math.max(streak.currentStreak, 1);
    markCelebrated(streak.lastCompletedDate ?? new Date().toISOString().slice(0, 10));
    if (!inPlace) beginPending(days, days);
    timers.current.push(
      setTimeout(() => setBadgeDays(days), 0),
      setTimeout(() => {
        if (inPlace) {
          void refreshStreak();
          return;
        }
        if (badgeRef.current) triggerFly(badgeRef.current, isMilestoneDay(days) ? days : null);
        else cancelPending();
        void refreshStreak();
      }, HOLD_MS),
      setTimeout(() => setBadgeDays(null), inPlace ? IN_PLACE_MS : HOLD_MS + 150)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak.loaded, streak.todayDone]);

  if (badgeDays === null) return null;
  const level = getStreakLevel(badgeDays);

  return (
    <div
      // Under the header rather than at the bottom, where the practice screen
      // keeps Previous / Next.
      className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center"
      role="status"
    >
      <div className="flex flex-col items-center gap-2">
        <div
          ref={badgeRef}
          className="animate-streak-pop relative flex items-center gap-2 rounded-full border px-4 py-2 shadow-lg"
          // The box carries the level's colour; the flame is always fire.
          style={{
            backgroundColor: `color-mix(in oklch, ${level.accent} 18%, var(--card))`,
            borderColor: `color-mix(in oklch, ${level.accent} 35%, transparent)`,
            boxShadow: "0 10px 30px -10px rgb(255 110 30 / 0.5)",
          }}
        >
          <StreakEmbers />
          <StreakFlame className="size-6" glow={Math.max(level.glowIntensity, 2)} />
          <span className="text-sm font-semibold" style={{ color: level.accent }}>
            {badgeDays} day{badgeDays === 1 ? "" : "s"}
          </span>
        </div>
        <p className="animate-streak-pop rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm [animation-delay:120ms]">
          Daily goal reached
        </p>
      </div>
    </div>
  );
}
