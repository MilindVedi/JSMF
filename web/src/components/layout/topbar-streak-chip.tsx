"use client";

import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { useStreakAnimationStore } from "@/store/streak-animation-store";
import { STREAK_LEVELS, getStreakLevel } from "@/lib/streak-config";
import { cn } from "@/lib/utils";
import { AngadNote } from "@/components/dev/angad-note";

/**
 * The global streak indicator. Registers itself as the landing target for
 * StreakFlyOverlay. From the moment a completion begins (before the real
 * count even changes) through to the badge landing, it shows the count
 * frozen at its pre-completion value, so the number visibly "arrives" only
 * when the badge does — even though the underlying count is already correct
 * the moment it changes.
 */
export function TopbarStreakChip({ streakDays }: { streakDays: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const registerTopbarTarget = useStreakAnimationStore((s) => s.registerTopbarTarget);
  const phase = useStreakAnimationStore((s) => s.phase);

  // Refs/state are only ever written inside effects/callbacks below, never
  // read or written during render.
  const [frozen, setFrozen] = useState(streakDays);
  const [pulse, setPulse] = useState(false);
  const [ringHue, setRingHue] = useState<string | null>(null);

  useEffect(() => {
    registerTopbarTarget(elRef.current);
    return () => registerTopbarTarget(null);
  }, [registerTopbarTarget]);

  useEffect(() => {
    // Subscribing directly (rather than mirroring store state into local
    // state via an effect body) so every setState call here runs inside
    // zustand's change callback, in reaction to an actual landing/flight
    // event — not synchronously as a side effect of this effect running.
    const unsubscribe = useStreakAnimationStore.subscribe((state, prevState) => {
      if (state.phase !== "idle" && prevState.phase === "idle") {
        // Freeze from the moment completion begins ("pending"), not just
        // once the badge starts visually flying — the real streak count
        // already changes at the start of "pending", well before "flying".
        // Read the pre-completion count from the store, captured by the
        // caller — NOT a locally-tracked "last known streakDays" ref, which
        // would already have advanced to the new value by this point.
        // `beginPending` always supplies this, so the fallback is
        // unreachable; it's a plain literal (not `streakDays`) precisely so
        // this mount-once subscription doesn't need to close over that prop.
        setFrozen(state.flightFromValue ?? 0);
      }
      if (state.landedSignal !== prevState.landedSignal) {
        setPulse(true);
        setTimeout(() => setPulse(false), 550);
        if (state.milestoneHit !== null) {
          setRingHue(getStreakLevel(state.milestoneHit).accent);
          setTimeout(() => setRingHue(null), 950);
        }
      }
    });
    return unsubscribe;
  }, []);

  const shown = phase !== "idle" ? frozen : streakDays;
  const level = getStreakLevel(shown);

  return (
    <div className="flex items-center gap-1">
      <div
        ref={elRef}
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium transition-transform duration-200",
          level.idlePulse && "animate-streak-idle-pulse",
          pulse && "animate-streak-landed-pulse",
          ringHue && "animate-streak-milestone-ring"
        )}
        style={{
          backgroundColor: `color-mix(in oklch, ${level.accent} 14%, transparent)`,
          color: level.accent,
          boxShadow:
            level.glowIntensity > 0
              ? `0 0 ${6 + level.glowIntensity * 4}px color-mix(in oklch, ${level.accent} ${10 + level.glowIntensity * 6}%, transparent)`
              : undefined,
          ["--streak-ring-color" as string]: ringHue ?? undefined,
        }}
      >
        <Flame
          className={cn("size-3.5", level.glowIntensity > 0 && "animate-streak-fire")}
          strokeWidth={2}
          fill="currentColor"
          fillOpacity={0.35}
          style={{ ["--streak-flame-color" as string]: level.accent }}
        />
        {shown}
        <span className="hidden sm:inline">-day streak</span>
      </div>

      <AngadNote compact>
        <p className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
          Streak stages (mock preview)
        </p>
        <div className="flex flex-col gap-1">
          {STREAK_LEVELS.map((stage, i) => {
            const next = STREAK_LEVELS[i + 1];
            const range = next ? `${stage.minDays}–${next.minDays - 1} days` : `${stage.minDays}+ days`;
            const isCurrent = stage.id === level.id;
            return (
              <div
                key={stage.id}
                className={cn("flex items-center gap-2 rounded px-1.5 py-1", isCurrent && "bg-muted")}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.accent }}
                />
                <span className="flex-1 truncate text-foreground">{stage.label}</span>
                <span className="shrink-0 text-muted-foreground">{range}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          This is only here to show you the color coding used for different streak stages and the logic
          behind them — not something to review or decide on.
        </p>
      </AngadNote>
    </div>
  );
}
