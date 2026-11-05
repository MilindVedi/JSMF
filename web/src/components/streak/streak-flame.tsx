import { useId } from "react";
import { getStreakLevel } from "@jsmf/core/domain";
import { cn } from "@/lib/utils";

/**
 * The fire itself, always in fire colours — yellow core, orange body, red
 * tips — at every streak level. The level's own colour belongs to the aura
 * around the flame, never to the fire.
 */
export function FlameMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  // Gradient ids must be unique per instance: several flames share a page.
  const id = useId().replace(/:/g, "");

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("overflow-visible", className)} style={style}>
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
      <path
        fill={`url(#${id}-outer)`}
        d="M12 1.8c.6 3-1 4.9-2.6 6.8C7.6 10.7 6 12.6 6 15.4 6 19 8.7 22 12 22s6-3 6-6.6c0-2.3-1-4-2-5.3-.3 1.4-1 2.4-2.2 2.9.5-3.8-.4-8.2-1.8-11.2Z"
      />
      <path
        fill={`url(#${id}-inner)`}
        d="M12.3 10.6c.2 1.8-.7 2.9-1.6 4-.8.9-1.5 1.8-1.5 3.1 0 1.8 1.3 3.1 2.8 3.1s2.8-1.3 2.8-3.1c0-1-.4-1.8-.9-2.4-.2.6-.6 1-1.1 1.2.2-2-.1-4.2-.5-5.9Z"
      />
    </svg>
  );
}

/**
 * The streak flame as it appears everywhere a streak is shown.
 *
 * Three things move, on three different periods, so the whole never pulses in
 * lockstep: an aura breathing behind the fire, the fire flickering, and two
 * sparks rising out of it. The aura is the only part that carries the tier's
 * colour — `getStreakLevel` decides it, so the nine-tier curve stays the one
 * place a day count becomes a colour, shared with the mobile app.
 *
 * `days` of 0 means nothing is burning: the fire dims and everything stops.
 * `live={false}` is for a flame used as a label, where motion would distract.
 * The box is `size + 14` so the aura has room to breathe past the glyph.
 */
export function StreakFlame({
  days = 0,
  size = 16,
  live = true,
  className,
}: {
  days?: number;
  size?: number;
  live?: boolean;
  className?: string;
}) {
  const level = getStreakLevel(days);
  const cold = days < 1;

  return (
    <span
      className={cn("streak-flame", className)}
      data-cold={cold || undefined}
      data-still={!live || undefined}
      style={{ width: size + 14, height: size + 14, "--aura": level.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="streak-aura" />
      <FlameMark className="streak-icon" style={{ width: size, height: size }} />
      {!cold && live && (
        <>
          <span className="streak-spark streak-spark-1" />
          <span className="streak-spark streak-spark-2" />
        </>
      )}
    </span>
  );
}
