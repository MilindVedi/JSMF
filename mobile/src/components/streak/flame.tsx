import { useEffect, useId } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

const OUTER =
  "M12 1.8c.6 3-1 4.9-2.6 6.8C7.6 10.7 6 12.6 6 15.4 6 19 8.7 22 12 22s6-3 6-6.6c0-2.3-1-4-2-5.3-.3 1.4-1 2.4-2.2 2.9.5-3.8-.4-8.2-1.8-11.2Z";
const INNER =
  "M12.3 10.6c.2 1.8-.7 2.9-1.6 4-.8.9-1.5 1.8-1.5 3.1 0 1.8 1.3 3.1 2.8 3.1s2.8-1.3 2.8-3.1c0-1-.4-1.8-.9-2.4-.2.6-.6 1-1.1 1.2.2-2-.1-4.2-.5-5.9Z";

/**
 * The streak flame, always in fire colours — yellow core, orange body, red
 * tips — at every level (web's StreakFlame). The level's colour belongs to the
 * box the flame sits in, never to the fire. `live` runs the flicker: the outer
 * flame sways while the core breathes on a different period. Honours the
 * system's reduce-motion setting.
 */
export function StreakFlame({ size = 16, live = true, glow = 0 }: { size?: number; live?: boolean; glow?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduceMotion = useReducedMotion();
  const animate = live && !reduceMotion;
  const sway = useSharedValue(0);
  const core = useSharedValue(0);

  useEffect(() => {
    if (!animate) return;
    sway.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 450, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 450, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.8, { duration: 450, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 450, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    core.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 460, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 345, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 345, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    return () => {
      cancelAnimation(sway);
      cancelAnimation(core);
    };
  }, [animate, sway, core]);

  // Pivot near the base (12px, 22px of a 24px box), like web's transform-origin.
  const pivot = size * (22 / 24) - size / 2;
  const outerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: pivot },
      { rotate: `${sway.value * 3}deg` },
      { scaleY: 1 + sway.value * 0.03 },
      { translateY: -pivot },
    ],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, core.value) * 0.1,
    transform: [{ translateY: pivot }, { scaleX: 1 - core.value * 0.08 }, { scaleY: 1 + core.value * 0.07 }, { translateY: -pivot }],
  }));

  return (
    <View
      style={[
        { width: size, height: size },
        // A warm halo around the flame's shape on iOS (shadows follow content alpha there);
        // web would draw it as a square box, so it is native-only.
        glow > 0 && Platform.OS === "ios" && { shadowColor: "#ff8c28", shadowOpacity: 0.25 + glow * 0.12, shadowRadius: 1.5 + glow * 1.5, shadowOffset: { width: 0, height: 0 } },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, outerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id={`${id}o`} x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#ff6a00" />
              <Stop offset="0.55" stopColor="#ff3d00" />
              <Stop offset="1" stopColor="#e5170f" />
            </LinearGradient>
          </Defs>
          <Path d={OUTER} fill={`url(#${id}o)`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, outerStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, coreStyle]}>
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Defs>
              <LinearGradient id={`${id}i`} x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#fff3b0" />
                <Stop offset="0.6" stopColor="#ffd23f" />
                <Stop offset="1" stopColor="#ffa31a" />
              </LinearGradient>
            </Defs>
            <Path d={INNER} fill={`url(#${id}i)`} />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
