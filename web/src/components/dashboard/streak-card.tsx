"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Flame, Trophy } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useStreakState } from "@/lib/use-streak-state";
import { useStreakStore } from "@/store/streak-store";
import { useAuthStore } from "@/store/auth-store";
import { useStreakAnimationStore } from "@/store/streak-animation-store";
import { getStreakLevel, isMilestoneDay } from "@/lib/streak-config";
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
  const triggerFly = useStreakAnimationStore((s) => s.trigger);

  // Lazy initializer instead of an effect-driven setState: if today is
  // already celebrated (real, non-demo path), start at the target with
  // nothing to animate; otherwise start wherever real progress is.
  const [displayed, setDisplayed] = useState(() =>
    streak.celebratedToday ? streak.dailyTarget : streak.todayProgress
  );
  const [burst, setBurst] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);
  const hasCompletedRef = useRef(false);

  function completeToday() {
    const today = streak.lastCompletedDate ?? new Date().toISOString().slice(0, 10);
    const newStreak = streak.currentStreak + 1;

    setBurst(true);
    setTimeout(() => setBurst(false), 900);

    // Freeze every streak-count display (topbar included) at the
    // pre-completion value *before* the real count changes below — not just
    // once the badge visually starts flying — so nothing briefly shows the
    // new count ahead of the animation actually reaching it. Guarded on
    // badgeRef so a missing badge (should never happen while mounted) can't
    // leave the freeze stuck on with no flight to ever clear it.
    if (badgeRef.current) {
      beginPending(streak.currentStreak);
    }

    // The count updates immediately and independently of the animation, so
    // it's correct even if the fly/land sequence never plays.
    updateProfile({ streakDays: newStreak });
    recordStreak(newStreak);
    markCelebrated(today);

    if (badgeRef.current) {
      const milestoneHit = isMilestoneDay(newStreak) ? newStreak : null;
      // A short delay lets the burst read as "the card celebrating" before
      // the badge detaches and travels to the topbar.
      setTimeout(() => {
        if (badgeRef.current) triggerFly(badgeRef.current, milestoneHit);
      }, 500);
    }
  }

  useEffect(() => {
    if (streak.celebratedToday || hasCompletedRef.current) return;

    if (streak.currentStreak === 0) {
      // A brand-new streak only ever starts from genuine practice, never
      // the demo ramp below — otherwise merely visiting the dashboard would
      // fabricate day one before any real questions were answered today.
      // `streak.todayProgress` is real attempt data, so this is the actual
      // "first completion" path the demo ramp is a stand-in for elsewhere.
      //
      // hasCompletedRef is set only *inside* the timeout callback (not
      // before scheduling it), with a non-zero delay — mirroring the ramp
      // branch below. React's dev-mode StrictMode double-invokes effects
      // (mount, cleanup, mount again) synchronously; a `setTimeout(fn, 0)`
      // scheduled on the first pass gets cancelled by that cleanup before
      // it can fire, and if the ref were already set beforehand, the
      // surviving second pass would see it as "done" and never reschedule
      // — completeToday() would silently never run. Delaying by
      // RAMP_STEP_MS and only mutating the ref once the timer actually
      // fires avoids that.
      if (streak.todayProgress >= streak.dailyTarget) {
        const timeout = setTimeout(() => {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            completeToday();
          }
        }, RAMP_STEP_MS);
        return () => clearTimeout(timeout);
      }
      return;
    }

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
  }, [streak.currentStreak === 0, streak.celebratedToday, streak.todayProgress]);

  const level = getStreakLevel(streak.currentStreak);
  const percent = Math.min(Math.round((displayed / streak.dailyTarget) * 100), 100);
  const isComplete = percent >= 100;

  if (streak.currentStreak === 0) {
    return (
      <div className="flex h-full flex-col justify-center rounded-xl border border-dashed border-border bg-card p-5 text-center">
        {/* badgeRef needs a real element here too (not just in the "has a
            streak" branch below) so the very first real completion — going
            from 0 to 1 — still has something to fly from. */}
        <div ref={badgeRef} className="mx-auto flex size-6 items-center justify-center">
          <Flame className="size-6 text-muted-foreground/50" strokeWidth={1.75} />
        </div>
        <p className="mt-2 font-heading text-sm font-semibold text-foreground">
          Start your streak today
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer {streak.dailyTarget} questions to begin one.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col justify-center rounded-xl border border-border bg-card p-5 transition-transform duration-300",
        burst && "scale-[1.015]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Today&apos;s streak progress
          </p>
          <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
            {displayed}{" "}
            <span className="text-base font-medium text-muted-foreground">
              / {streak.dailyTarget} questions
            </span>
          </p>
        </div>

        <div
          ref={badgeRef}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 transition-transform duration-300",
            level.idlePulse && "animate-streak-idle-pulse",
            burst && "scale-110"
          )}
          style={{
            backgroundColor: `color-mix(in oklch, ${level.accent} 16%, transparent)`,
          }}
        >
          <Flame className="size-3.5" strokeWidth={2} style={{ color: level.accent }} />
          <span className="text-xs font-semibold" style={{ color: level.accent }}>
            {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <Progress value={percent} className="mt-4" aria-label="Progress toward today's goal" />

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
            Best: {streak.bestStreak} day{streak.bestStreak === 1 ? "" : "s"}
          </p>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {streak.dailyTarget - displayed} more to reach today&apos;s goal.
          </p>
          <p className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Trophy className="size-3.5" />
            Best: {streak.bestStreak}d
          </p>
        </div>
      )}
    </div>
  );
}
