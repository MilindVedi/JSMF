import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The streak flame, always in fire colours — yellow core, orange body, red
 * tips — at every streak level. The level's own colour belongs to the box the
 * flame sits in, never to the fire itself.
 *
 * `glow` (0–4, the level's glowIntensity) adds a warm halo; `live` runs the
 * flicker: the outer flame sways while the core breathes, out of phase, so it
 * reads as a small real fire rather than a pulsing icon.
 */
export function StreakFlame({
  className,
  glow = 0,
  live = true,
}: {
  className?: string;
  glow?: number;
  live?: boolean;
}) {
  // Gradient ids must be unique per instance: several flames share a page.
  const id = useId().replace(/:/g, "");
  const halo = glow > 0 ? `drop-shadow(0 0 ${1.5 + glow * 1.5}px rgb(255 140 40 / ${0.25 + glow * 0.12}))` : undefined;

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
      style={{ filter: halo }}
    >
      <defs>
        <linearGradient id={`${id}-outer`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff6a00" />
          <stop offset="55%" stopColor="#ff3d00" />
          <stop offset="100%" stopColor="#e5170f" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="60%" stopColor="#ffd23f" />
          <stop offset="100%" stopColor="#ffa31a" />
        </linearGradient>
      </defs>
      <g className={cn(live && "animate-flame-sway")} style={{ transformOrigin: "12px 22px" }}>
        <path
          fill={`url(#${id}-outer)`}
          d="M12 1.8c.6 3-1 4.9-2.6 6.8C7.6 10.7 6 12.6 6 15.4 6 19 8.7 22 12 22s6-3 6-6.6c0-2.3-1-4-2-5.3-.3 1.4-1 2.4-2.2 2.9.5-3.8-.4-8.2-1.8-11.2Z"
        />
        <path
          className={cn(live && "animate-flame-core")}
          style={{ transformOrigin: "12px 21px" }}
          fill={`url(#${id}-inner)`}
          d="M12.3 10.6c.2 1.8-.7 2.9-1.6 4-.8.9-1.5 1.8-1.5 3.1 0 1.8 1.3 3.1 2.8 3.1s2.8-1.3 2.8-3.1c0-1-.4-1.8-.9-2.4-.2.6-.6 1-1.1 1.2.2-2-.1-4.2-.5-5.9Z"
        />
      </g>
    </svg>
  );
}
