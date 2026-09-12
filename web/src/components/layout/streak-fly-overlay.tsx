"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { useStreakAnimationStore } from "@/store/streak-animation-store";

const BADGE_SIZE = 26;

/**
 * Renders the badge that visually travels from the dashboard StreakCard to
 * the topbar streak indicator when today's goal completes. Mounted once in
 * the authenticated app shell so it can fly across page content regardless
 * of which page triggered it. Pure CSS transform/opacity transition —
 * measured with getBoundingClientRect, no animation library needed.
 */
export function StreakFlyOverlay() {
  const phase = useStreakAnimationStore((s) => s.phase);
  const sourceRect = useStreakAnimationStore((s) => s.sourceRect);
  const topbarEl = useStreakAnimationStore((s) => s.topbarEl);
  const notifyLanded = useStreakAnimationStore((s) => s.notifyLanded);

  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    // No setState directly in the effect body: every setStyle call below
    // runs inside an rAF callback, so it's a reaction to a frame committing
    // (an external timing event), not a synchronous side effect of render.
    if (phase !== "flying" || !sourceRect) return;

    // Plain closure-local variables, not refs — they only need to live for
    // this one effect invocation, so there's nothing for a ref to buy here.
    let raf1 = 0;
    let raf2 = 0;

    raf1 = requestAnimationFrame(() => {
      setStyle({
        position: "fixed",
        left: sourceRect.left + sourceRect.width / 2 - BADGE_SIZE / 2,
        top: sourceRect.top + sourceRect.height / 2 - BADGE_SIZE / 2,
        transform: "scale(1)",
        opacity: 1,
        transition: "none",
      });

      const targetRect = topbarEl?.getBoundingClientRect() ?? null;

      raf2 = requestAnimationFrame(() => {
        if (!targetRect) {
          // No registered topbar target (e.g. very small viewport) — fade
          // out in place rather than flying nowhere. onTransitionEnd only
          // fires for the "left" transition below, so this path has to
          // call notifyLanded itself or phase would stay "flying" forever.
          setStyle((prev) => (prev ? { ...prev, opacity: 0, transition: "opacity 400ms ease" } : prev));
          setTimeout(notifyLanded, 400);
          return;
        }
        setStyle({
          position: "fixed",
          left: targetRect.left + targetRect.width / 2 - BADGE_SIZE / 2 - 6,
          top: targetRect.top + targetRect.height / 2 - BADGE_SIZE / 2,
          transform: "scale(0.6)",
          opacity: 0.85,
          transition:
            "left 650ms cubic-bezier(0.3,0.7,0.4,1), top 650ms cubic-bezier(0.3,0.7,0.4,1), transform 650ms ease, opacity 650ms ease",
        });
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase, sourceRect, topbarEl, notifyLanded]);

  if (phase !== "flying" || !style) return null;

  return (
    <div
      style={{ ...style, width: BADGE_SIZE, height: BADGE_SIZE }}
      onTransitionEnd={(e) => {
        // `left`/`top`/`transform`/`opacity` all finish near-together;
        // react to just one so this doesn't fire the landing four times.
        if (e.propertyName === "left") notifyLanded();
      }}
      className="pointer-events-none z-[200] flex items-center justify-center rounded-full bg-teal text-teal-foreground shadow-lg"
    >
      <Flame className="size-3.5" strokeWidth={2.2} />
    </div>
  );
}
