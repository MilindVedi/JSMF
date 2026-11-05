import { useEffect } from "react";
import { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

const HALF_CYCLE_MS = 1300;
const LOW_OPACITY = 0.72;

/**
 * The slow "breathing" a streak badge does at the hotter tiers (web's
 * animate-streak-idle-pulse: opacity 1 → 0.72 → 1 over 2.6 s). Off under
 * reduce-motion and below the tier that asks for it.
 */
export function useStreakIdlePulse(active: boolean) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (active && !reduceMotion) {
      const ease = { duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.ease) };
      opacity.value = withRepeat(withSequence(withTiming(LOW_OPACITY, ease), withTiming(1, ease)), -1);
    } else {
      cancelAnimation(opacity);
      opacity.value = 1;
    }
    return () => cancelAnimation(opacity);
  }, [active, reduceMotion, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
