"use client";

import { useEffect, useRef } from "react";
import { StreakFlame } from "@/components/streak/streak-flame";
import { getStreakLevel } from "@jsmf/core/domain";
import { useStreakAnimationStore } from "@/store/streak-animation-store";

const BADGE_SIZE = 30;
const FLIGHT_MS = 780;
/** How far above the straight line the arc rises, relative to its length. */
const ARC_LIFT = 0.28;

/**
 * The badge that travels from wherever the daily goal was celebrated (the
 * dashboard StreakCard, or StreakGoalCelebrator) to the topbar streak chip.
 * Mounted once in the app shell so it can cross any page.
 *
 * It flies on a curve, not a straight line: a quadratic arc sampled into
 * Web Animations keyframes, shrinking as it goes and trailing a soft glow —
 * then the chip pulses as it lands (TopbarStreakChip). The flame keeps its
 * fire colours; the badge takes the colour of the level being reached.
 */
export function StreakFlyOverlay() {
  const phase = useStreakAnimationStore((s) => s.phase);
  const sourceRect = useStreakAnimationStore((s) => s.sourceRect);
  const topbarEl = useStreakAnimationStore((s) => s.topbarEl);
  const flightToValue = useStreakAnimationStore((s) => s.flightToValue);
  const notifyLanded = useStreakAnimationStore((s) => s.notifyLanded);
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const badge = badgeRef.current;
    if (phase !== "flying" || !sourceRect || !badge) return;

    // Reduced motion: no flight at all — the chip's landing pulse still marks it.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      notifyLanded();
      return;
    }

    const from = { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 };
    const targetRect = topbarEl?.getBoundingClientRect() ?? null;

    if (!targetRect) {
      // No topbar chip on screen: settle in place instead of flying nowhere.
      const fade = badge.animate(
        [{ transform: translate(from, 1), opacity: 1 }, { transform: translate(from, 1.2), opacity: 0 }],
        { duration: 420, easing: "ease-out", fill: "forwards" }
      );
      fade.onfinish = notifyLanded;
      return () => fade.cancel();
    }

    const to = { x: targetRect.left + 14, y: targetRect.top + targetRect.height / 2 };
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - length * ARC_LIFT };

    const steps = 16;
    const frames: Keyframe[] = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const point = {
        x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x,
        y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y,
      };
      // Grows a touch as it lifts off, then shrinks into the chip.
      const scale = t < 0.2 ? 1 + t * 0.6 : 1.12 - (t - 0.2) * 0.65;
      return { transform: translate(point, scale), opacity: t > 0.9 ? 0.6 : 1, offset: t };
    });

    const flight = badge.animate(frames, {
      duration: FLIGHT_MS,
      easing: "cubic-bezier(0.45, 0.05, 0.25, 1)",
      fill: "forwards",
    });
    flight.onfinish = notifyLanded;
    return () => flight.cancel();
  }, [phase, sourceRect, topbarEl, notifyLanded]);

  if (phase !== "flying" || !sourceRect) return null;
  const level = getStreakLevel(flightToValue ?? 1);

  return (
    <div
      ref={badgeRef}
      className="pointer-events-none fixed top-0 left-0 z-[200] flex items-center justify-center rounded-full border shadow-lg"
      style={{
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        // Starts at the source; the animation takes over from the first frame.
        transform: translate({ x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 }, 1),
        backgroundColor: `color-mix(in oklch, ${level.accent} 22%, var(--card))`,
        borderColor: `color-mix(in oklch, ${level.accent} 40%, transparent)`,
        boxShadow: `0 6px 20px -6px rgb(255 110 30 / 0.55)`,
      }}
    >
      <StreakFlame className="size-4" glow={2} />
    </div>
  );
}

/** Centres the badge on `point`. */
function translate(point: { x: number; y: number }, scale: number) {
  return `translate(${point.x - BADGE_SIZE / 2}px, ${point.y - BADGE_SIZE / 2}px) scale(${scale})`;
}
