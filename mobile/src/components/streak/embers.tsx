import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

/**
 * A one-shot burst of embers around a streak badge, for the moment the daily
 * goal is reached (web's StreakEmbers). Decorative; skipped entirely when the
 * system asks for reduced motion.
 */
const EMBERS = Array.from({ length: 10 }, (_, i) => {
  // Spread around the badge but biased upward, the way sparks rise.
  const angle = (-90 + (i - 4.5) * 26) * (Math.PI / 180);
  const distance = 26 + (i % 3) * 9;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance - 6,
    size: 3 + (i % 3),
    delay: (i % 4) * 45,
    color: ["#ffd23f", "#ff8a1f", "#ff4d1a"][i % 3],
  };
});

function Ember({ x, y, size, delay, color }: (typeof EMBERS)[number]) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.bezier(0.2, 0.7, 0.3, 1) }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? t.value / 0.15 : 1 - (t.value - 0.15) / 0.85,
    transform: [{ translateX: x * t.value }, { translateY: y * t.value }, { scale: 1 - 0.8 * t.value }],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", width: size, height: size, borderRadius: size, backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 4 },
        style,
      ]}
    />
  );
}

export function StreakEmbers() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      {EMBERS.map((ember, i) => (
        <Ember key={i} {...ember} />
      ))}
    </View>
  );
}
