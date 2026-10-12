import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useStreakAnimationStore, type Rect } from "@/lib/streak";
import { useColors, useStreakAccent, withAlpha } from "@/theme/theme";
import { StreakFlame } from "./flame";

const BADGE = 32;
const FLIGHT_MS = 780;
/** How far above the straight line the arc rises, relative to its length. */
const ARC_LIFT = 0.28;

/**
 * The badge that travels from wherever the daily goal was celebrated to the
 * header streak chip (web's StreakFlyOverlay): a quadratic arc, growing a
 * touch as it lifts off and shrinking into the chip, which then pulses. With
 * no chip on screen it settles in place; with reduce-motion on it skips the
 * flight and lands straight away.
 */
export function StreakFlyOverlay() {
  const phase = useStreakAnimationStore((s) => s.phase);
  const sourceRect = useStreakAnimationStore((s) => s.sourceRect);
  const flightFromValue = useStreakAnimationStore((s) => s.flightFromValue);
  const notifyLanded = useStreakAnimationStore((s) => s.notifyLanded);
  const reduceMotion = useReducedMotion();
  const colors = useColors();
  const accent = useStreakAccent((flightFromValue ?? 0) + 1);
  const [path, setPath] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } | null } | null>(null);
  const t = useSharedValue(0);

  useEffect(() => {
    if (phase !== "flying") {
      setPath(null);
      return;
    }
    if (reduceMotion || !sourceRect) {
      notifyLanded();
      return;
    }
    let cancelled = false;
    const from = centre(sourceRect);
    const measure = useStreakAnimationStore.getState().measureTarget;
    void (measure ? measure() : Promise.resolve(null)).then((target) => {
      if (cancelled) return;
      const to = target ? { x: target.x + 14, y: target.y + target.height / 2 } : null;
      setPath({ from, to });
      t.value = 0;
      t.value = withTiming(1, { duration: to ? FLIGHT_MS : 420, easing: Easing.bezier(0.45, 0.05, 0.25, 1) }, (finished) => {
        if (finished) scheduleOnRN(notifyLanded);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [phase, sourceRect, reduceMotion, notifyLanded, t]);

  const from = path?.from ?? { x: 0, y: 0 };
  const to = path?.to ?? null;
  const style = useAnimatedStyle(() => {
    const p = t.value;
    if (!to) {
      // No chip to fly to: swell slightly and fade where it is.
      return { opacity: 1 - p, transform: [{ translateX: from.x - BADGE / 2 }, { translateY: from.y - BADGE / 2 }, { scale: 1 + 0.2 * p }] };
    }
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const cx = (from.x + to.x) / 2;
    const cy = Math.min(from.y, to.y) - length * ARC_LIFT;
    const x = (1 - p) ** 2 * from.x + 2 * (1 - p) * p * cx + p ** 2 * to.x;
    const y = (1 - p) ** 2 * from.y + 2 * (1 - p) * p * cy + p ** 2 * to.y;
    const scale = p < 0.2 ? 1 + p * 0.6 : 1.12 - (p - 0.2) * 0.65;
    return { opacity: p > 0.9 ? 0.6 : 1, transform: [{ translateX: x - BADGE / 2 }, { translateY: y - BADGE / 2 }, { scale }] };
  });

  if (phase !== "flying" || !path) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            width: BADGE,
            height: BADGE,
            borderRadius: BADGE,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            backgroundColor: colors.card,
            borderColor: withAlpha(accent, 0.4),
            shadowColor: "#ff6e1e",
            shadowOpacity: 0.55,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          },
          style,
        ]}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: BADGE, backgroundColor: withAlpha(accent, 0.22) }]} />
        <StreakFlame size={17} glow={2} />
      </Animated.View>
    </View>
  );
}

function centre(rect: Rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
