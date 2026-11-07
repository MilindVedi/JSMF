import { Children, isValidElement, useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * A part of a screen that rises in when it first appears: from `distance`px
 * down and transparent, over `durationMs`, `delayMs` after it mounts — so the
 * parts arrive one after another. Shown at once under reduce-motion. Only the
 * first appearance animates; later re-renders (new data) leave it in place.
 *
 * Driven by a shared value rather than a layout `entering` animation: on web
 * those re-ran when a form re-rendered (an error appearing), and the content
 * vanished.
 */
export function Rise({
  delayMs = 0,
  durationMs = 520,
  distance = 14,
  className,
  children,
}: {
  delayMs?: number;
  durationMs?: number;
  distance?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(withDelay(delayMs, withTiming(1, { duration: durationMs, easing: EASING })));
    return () => cancelAnimation(progress);
    // Once, on mount: a new delay or duration later must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return (
    <Animated.View style={style}>
      <View className={className}>{children}</View>
    </Animated.View>
  );
}

/** The gap between parts of a screen arriving, and the most that stagger (later ones arrive with the last). */
const STEP_MS = 55;
const MAX_STEPS = 7;

/**
 * A screen's parts rising in one after another, top to bottom (the calm
 * entrance every tab uses). Each direct child is one part; keyed children
 * keep their own animation state across re-renders.
 */
export function Stagger({ children, startMs = 0, className }: { children: ReactNode; startMs?: number; className?: string }) {
  const parts = Children.toArray(children).filter(Boolean);
  return (
    <>
      {parts.map((child, i) => (
        <Rise key={isValidElement(child) && child.key != null ? child.key : i} delayMs={startMs + Math.min(i, MAX_STEPS) * STEP_MS} className={className}>
          {child}
        </Rise>
      ))}
    </>
  );
}
