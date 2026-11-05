import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Timer as TimerIcon } from "lucide-react-native";
import { formatClock } from "@jsmf/core/domain";
import { useColors } from "@/theme/theme";
import { cn, Txt } from "@/components/ui/text";

/** A countdown that calls `onTimeUp` once at zero (web's TimerDisplay). */
export function Timer({
  durationSec,
  onTimeUp,
  warnAtSec = 60,
  withHours = false,
  className,
}: {
  durationSec: number;
  onTimeUp?: () => void;
  warnAtSec?: number;
  withHours?: boolean;
  className?: string;
}) {
  const colors = useColors();
  const [remaining, setRemaining] = useState(durationSec);
  const fired = useRef(false);
  const timeUp = useRef(onTimeUp);
  timeUp.current = onTimeUp;

  useEffect(() => {
    // Counted against a fixed end, not by decrementing: a backgrounded app's
    // timers pause, and a three-hour mock must not drift.
    const endsAt = Date.now() + durationSec * 1000;
    const id = setInterval(() => setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
    // Set once, at mount; a new duration is a new timer (keyed by the caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (remaining === 0 && !fired.current) {
      fired.current = true;
      timeUp.current?.();
    }
  }, [remaining]);

  const low = remaining <= warnAtSec;
  return (
    <View
      className={cn("flex-row items-center gap-1.5 rounded-lg px-2.5 py-1.5", low ? "bg-error" : "bg-muted", className)}
      accessibilityLabel={`Time left ${formatClock(remaining, withHours)}`}
      accessibilityLiveRegion={low ? "polite" : "none"}
    >
      <TimerIcon size={14} color={low ? colors["error-foreground"] : colors.foreground} />
      <Txt font="mono" weight={600} className={cn("text-[13px]", low ? "text-error-foreground" : "text-foreground")}>
        {formatClock(remaining, withHours)}
      </Txt>
    </View>
  );
}
