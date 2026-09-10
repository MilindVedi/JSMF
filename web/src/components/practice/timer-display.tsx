"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TimerDisplay({
  durationSec,
  onTimeUp,
}: {
  durationSec: number;
  onTimeUp?: () => void;
}) {
  const [remaining, setRemaining] = useState(durationSec);
  const firedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (remaining === 0 && !firedRef.current) {
      firedRef.current = true;
      onTimeUp?.();
    }
  }, [remaining, onTimeUp]);

  const low = remaining <= 60;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        low ? "bg-error text-error-foreground" : "bg-muted text-foreground"
      )}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <Timer className="size-3.5" />
      {formatTime(remaining)}
    </div>
  );
}
