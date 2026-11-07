import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { Txt, type TxtProps } from "@/components/ui/text";

const DURATION_MS = 700;

/**
 * A number that counts up to `value` when it first shows (and glides to a new
 * value when it changes), easing out so it settles rather than stops. Shows
 * the value straight away under reduce-motion.
 */
export function useCountUp(value: number, durationMs = DURATION_MS): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    const start = Date.now();
    const begin = from.current;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = begin + (value - begin) * eased;
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduceMotion]);

  return reduceMotion ? value : shown;
}

/**
 * `value` counting up, as text: whole numbers only (a percentage, a count).
 * Screen readers get the final value, never the moving one.
 */
export function CountUp({ value, suffix = "", ...props }: Omit<TxtProps, "children"> & { value: number; suffix?: string }) {
  const shown = useCountUp(value);
  return (
    <Txt accessibilityLabel={`${value}${suffix}`} {...props}>
      {Math.round(shown)}
      {suffix}
    </Txt>
  );
}
