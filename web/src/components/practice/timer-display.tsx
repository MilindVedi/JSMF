"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock as formatTime } from "@jsmf/core/domain";

export function TimerDisplay({
  durationSec,
  onTimeUp,
  warnAtSec = 60,
  withHours = false,
  className,
}: {
  durationSec: number;
  onTimeUp?: () => void;
  /** Turns the error colour on at or below this many seconds. */
  warnAtSec?: number;
  /** `hh:mm:ss`, as an exam console shows it, instead of `m:ss`. */
  withHours?: boolean;
  className?: string;
}) {
  const [remaining, setRemaining] = useState(durationSec);
  const firedRef = useRef(false);

  useEffect(() => {
    // Counted against a fixed end, not by decrementing: browsers slow timers
    // in background tabs, and a three-hour mock must not drift.
    const endsAt = Date.now() + durationSec * 1000;
    const interval = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
    // The clock is set once, at mount; a new duration means a new timer (keyed by the caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (remaining === 0 && !firedRef.current) {
      firedRef.current = true;
      onTimeUp?.();
    }
  }, [remaining, onTimeUp]);

  const low = remaining <= warnAtSec;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        low ? "bg-error text-error-foreground" : "bg-muted text-foreground",
        className
      )}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <Timer className="size-3.5" />
      {formatTime(remaining, withHours)}
    </div>
  );
}
