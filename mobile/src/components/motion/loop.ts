import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * A clock for a looping animation: runs 0 → 1 every `periodMs`, forever, after
 * `delayMs`. Every looping effect (floating orbs, the waving hand, the sheen,
 * the nudging arrow) is a pure function of this value, written like a CSS
 * keyframe list with `interpolate`.
 *
 * Under reduce-motion it never starts and stays at 0, so each effect is
 * written to rest at 0.
 */
export function useLoopClock(periodMs: number, delayMs = 0): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);

  useEffect(() => {
    clock.value = 0;
    if (reduceMotion) return;
    clock.value = withDelay(delayMs, withRepeat(withTiming(1, { duration: periodMs, easing: Easing.linear }), -1));
    return () => cancelAnimation(clock);
  }, [reduceMotion, periodMs, delayMs, clock]);

  return clock;
}

/** 0 → 1 → 0 over one turn of a clock, eased at both ends (CSS ease-in-out between two keyframes). */
export function swing(t: number, phase = 0): number {
  "worklet";
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * (t + phase));
}

/** Smoothstep of `t` across [from, to]: 0 before, 1 after, eased in between. */
export function ease(t: number, from: number, to: number): number {
  "worklet";
  const u = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return u * u * (3 - 2 * u);
}

const PRESS_MS = 120;

/**
 * The small "give" of a pressed button: scales to 0.97 while held. Pass the
 * handlers to the Pressable and the style to an Animated.View around it.
 */
export function usePressScale(pressedScale = 0.97) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const to = (value: number) => {
    scale.set(reduceMotion ? 1 : withTiming(value, { duration: PRESS_MS }));
  };
  return { style, onPressIn: () => to(pressedScale), onPressOut: () => to(1) };
}
