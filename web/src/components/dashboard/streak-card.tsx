"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Target, Trophy } from "lucide-react";
import { StreakEmbers } from "@/components/streak/streak-embers";
import { StreakFlame } from "@/components/streak/streak-flame";
import { Progress } from "@/components/ui/progress";
import { useStreakState } from "@/lib/use-streak-state";
import { isApiDataSource, useRefreshStreak } from "@/hooks/pyq";
import { useStreakStore } from "@/store/streak-store";
import { useAuthStore } from "@/store/auth-store";
import { useStreakAnimationStore } from "@/store/streak-animation-store";
import { getStreakLevel, isMilestoneDay } from "@jsmf/core/domain";
import { cn } from "@/lib/utils";

const RAMP_STEP_MS = 220;

/**
 * The dashboard's streak/progress card. Ramps today's progress up to the
 * daily target on every mount to demonstrate the completion flourish — see
 * DEMO_ALWAYS_CELEBRATE_ON_VISIT in streak-config.ts for why, and how to
 * turn this into "only when the real count crosses the target" later.
 */
export function StreakCard() {
  const streak = useStreakState();
  const recordStreak = useStreakStore((s) => s.recordStreak);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const markCelebrated = useStreakAnimationStore((s) => s.markCelebrated);
  const beginPending = useStreakAnimationStore((s) => s.beginPending);
  const cancelPending = useStreakAnimationStore((s) => s.cancelPending);
  const triggerFly = useStreakAnimationStore((s) => s.trigger);
  const refreshStreak = useRefreshStreak();

  // Lazy initializer instead of an effect-driven setState: if today is
  // already celebrated (real, non-demo path), start at the target with
  // nothing to animate; otherwise start wherever real progress is.
  const [displayed, setDisplayed] = useState(() =>
    streak.celebratedToday ? streak.dailyTarget : streak.todayProgress
  );
  const [burst, setBurst] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);
  const hasCompletedRef = useRef(false);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Leaving the dashboard before the badge flies must not leave the topbar
  // frozen at the pre-celebration count for the rest of the session.
  useEffect(
    () => () => {
      if (flyTimer.current) clearTimeout(flyTimer.current);
      cancelPending();
    },
    [cancelPending]
  );

  function completeToday() {
    const today = streak.lastCompletedDate ?? new Date().toISOString().slice(0, 10);
    // Live, the server advances the streak in the same response that turns
    // todayDone true — reaching the goal is what earns the day — so the count
    // already in hand is the new one and the badge flies from the day before
    // it. The mock demo steps the count forward itself; either way the flight
    // runs from N-1 to N, as it does on mobile.
    const newStreak = isApiDataSource ? Math.max(streak.currentStreak, 1) : streak.currentStreak + 1;
    const fromStreak = Math.max(newStreak - 1, 0);

    setBurst(true);
    setTimeout(() => setBurst(false), 900);

    // Freeze every streak-count display (topbar included) at the
    // pre-completion value *before* the real count changes below — not just
    // once the badge visually starts flying — so nothing briefly shows the
    // new count ahead of the animation actually reaching it. Guarded on
    // badgeRef so a missing badge (should never happen while mounted) can't
    // leave the freeze stuck on with no flight to ever clear it.
    if (badgeRef.current) {
      beginPending(fromStreak, newStreak);
    }

    // The count updates immediately and independently of the animation, so
    // it's correct even if the fly/land sequence never plays.
    if (!isApiDataSource) {
      updateProfile({ streakDays: newStreak });
      recordStreak(newStreak);
      void refreshStreak();
    }
    markCelebrated(today);

    if (badgeRef.current) {
      const milestoneHit = isMilestoneDay(newStreak) ? newStreak : null;
      // A short delay lets the burst read as "the card celebrating" before
      // the badge detaches and travels to the topbar.
      flyTimer.current = setTimeout(() => {
        if (badgeRef.current) triggerFly(badgeRef.current, milestoneHit);
        else cancelPending();
      }, 500);
    }
  }

  useEffect(() => {
    if (!isApiDataSource) return;
    // Live: celebrate once the real count reaches the goal, no simulated ramp.
    if (!streak.loaded || !streak.todayDone || streak.celebratedToday || hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    completeToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak.loaded, streak.todayDone, streak.celebratedToday]);

  useEffect(() => {
    if (isApiDataSource || !streak.loaded) return;
    if (streak.celebratedToday || hasCompletedRef.current) return;

    let cancelled = false;
    let value = streak.todayProgress;

    const timer = setInterval(() => {
      if (cancelled) return;
      value = Math.min(value + Math.ceil(streak.dailyTarget / 5), streak.dailyTarget);
      setDisplayed(value);
      if (value >= streak.dailyTarget) {
        clearInterval(timer);
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          completeToday();
        }
      }
    }, RAMP_STEP_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Deliberately depends on todayProgress too, alongside the otherwise
    // identity-stable pieces of streak: practice-store rehydrates from
    // localStorage asynchronously, so on a fresh page load this effect's
    // first run can see a stale todayProgress of 0 (before hydration
    // completes) — without todayProgress as a dep, the real value arriving
    // moments later would never re-trigger this effect, permanently missing
    // a same-day completion. The ramp branch restarting once when that
    // happens (rather than only on mount) is an acceptable, barely-visible
    // side effect of the same fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak.loaded, streak.celebratedToday, streak.todayProgress]);

  const shown = isApiDataSource ? Math.min(streak.todayProgress, streak.dailyTarget) : displayed;

  const level = getStreakLevel(streak.currentStreak);
  const percent = Math.min(Math.round((shown / streak.dailyTarget) * 100), 100);
  const isComplete = percent >= 100;

  return (
    <div
      className={cn(
        "flex h-full flex-col justify-center rounded-xl border border-border bg-card p-5 transition-transform duration-300",
        burst && "scale-[1.015]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
          <Target className="size-4.5 text-primary" strokeWidth={2} />
          Today&apos;s goal
        </p>

        <div
          ref={badgeRef}
          className={cn(
            "relative flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 transition-transform duration-300",
            level.idlePulse && "animate-streak-idle-pulse",
            burst && "scale-110"
          )}
          // The box carries the level's colour; the flame is always fire.
          style={{
            backgroundColor: `color-mix(in oklch, ${level.accent} 16%, transparent)`,
            borderColor: `color-mix(in oklch, ${level.accent} 30%, transparent)`,
          }}
        >
          {burst && <StreakEmbers />}
          <StreakFlame days={streak.currentStreak} size={15} />
          <span className="text-xs font-semibold text-foreground">
            {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <p className="mt-4 font-heading text-3xl leading-none font-semibold tracking-tight text-foreground">
        {shown}{" "}
        <span className="text-base font-medium text-muted-foreground">
          / {streak.dailyTarget} questions
        </span>
      </p>

      {/* One pip per question rather than a continuous bar: at a target of ten
          a bar asks you to estimate, where pips can be counted — and each one
          filling is a step you took. Past a couple of dozen they would be too
          thin to read, so the bar comes back. */}
      {streak.dailyTarget <= 24 ? (
        <div
          className="mt-3 flex gap-1"
          role="img"
          aria-label={`${shown} of ${streak.dailyTarget} questions done today`}
        >
          {Array.from({ length: streak.dailyTarget }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors duration-300",
                i < shown ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      ) : (
        <Progress value={percent} className="mt-3" aria-label="Progress toward today's goal" />
      )}

      {isComplete ? (
        <div className="mt-3 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CheckCircle2 className="size-4" style={{ color: level.accent }} />
            Streak day complete
          </p>
          <p className="pl-[1.375rem] text-sm text-muted-foreground">
            Come back tomorrow to keep it going.
          </p>
          <p className="flex items-center gap-1 pl-[1.375rem] text-xs text-muted-foreground">
            <Trophy className="size-3.5" />
            Best streak: {streak.bestStreak} day{streak.bestStreak === 1 ? "" : "s"}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <p className="text-sm text-muted-foreground">
            {streak.dailyTarget - shown} more to reach today&apos;s goal.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Trophy className="size-3.5" />
            Best streak: {streak.bestStreak} day{streak.bestStreak === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
