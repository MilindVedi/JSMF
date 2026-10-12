import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useIsFocused } from "expo-router";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { getStreakLevel } from "@jsmf/core/domain";
import { useStreakAnimationStore, useStreakState, type Rect } from "@/lib/streak";
import { useStreakAccent, withAlpha } from "@/theme/theme";
import { Txt } from "@/components/ui/text";
import { StreakFlame } from "./flame";

/**
 * The global streak indicator in each tab's header (web's TopbarStreakChip).
 * The focused tab's chip is the landing target for the flying badge. From the
 * moment a completion begins until the badge lands it shows the pre-completion
 * count, so the number visibly "arrives" with the badge.
 */
export function StreakChip() {
  const { currentStreak } = useStreakState();
  const phase = useStreakAnimationStore((s) => s.phase);
  const flightFromValue = useStreakAnimationStore((s) => s.flightFromValue);
  const registerTarget = useStreakAnimationStore((s) => s.registerTarget);
  const focused = useIsFocused();
  const ref = useRef<View>(null);
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const ring = useSharedValue(0);
  const [ringDays, setRingDays] = useState<number | null>(null);

  const measure = useCallback(
    () =>
      new Promise<Rect | null>((resolve) => {
        if (!ref.current) return resolve(null);
        ref.current.measureInWindow((x, y, width, height) => resolve(width > 0 ? { x, y, width, height } : null));
      }),
    []
  );

  useEffect(() => {
    if (!focused) return;
    registerTarget(measure);
    return () => {
      if (useStreakAnimationStore.getState().measureTarget === measure) registerTarget(null);
    };
  }, [focused, measure, registerTarget]);

  useEffect(
    () =>
      useStreakAnimationStore.subscribe((state, prev) => {
        if (state.landedSignal === prev.landedSignal || !focused || reduceMotion) return;
        scale.value = withSequence(withTiming(1.18, { duration: 170 }), withSpring(1, { damping: 8, stiffness: 220 }));
        if (state.milestoneHit !== null) {
          setRingDays(state.milestoneHit);
          ring.value = 0;
          ring.value = withTiming(1, { duration: 900 });
          setTimeout(() => setRingDays(null), 950);
        }
      }),
    [focused, reduceMotion, scale, ring]
  );

  const shown = phase !== "idle" ? (flightFromValue ?? 0) : currentStreak;
  const accent = useStreakAccent(shown);
  const ringAccent = useStreakAccent(ringDays ?? 0);
  const level = getStreakLevel(shown);
  const chipStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.5 }] }));

  // No streak yet: an empty "0-day" pill reads as a failed achievement; the
  // home streak card carries that invitation instead.
  if (currentStreak <= 0) return null;

  return (
    <View ref={ref} collapsable={false}>
    <Animated.View
      style={[
        chipStyle,
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 5,
          backgroundColor: withAlpha(accent, 0.14),
          borderWidth: 1,
          borderColor: withAlpha(accent, 0.25),
        },
      ]}
      accessibilityLabel={`${shown}-day streak`}
    >
      {ringDays !== null ? (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", inset: -2, borderRadius: 999, borderWidth: 2, borderColor: ringAccent }, ringStyle]} />
      ) : null}
      <StreakFlame size={15} glow={level.glowIntensity} />
      <Txt weight={700} className="text-[13px]" style={{ color: accent }}>
        {shown}
      </Txt>
    </Animated.View>
    </View>
  );
}
