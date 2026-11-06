import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { LinearGradientFill } from "@/components/ui/gradient";
import { ease, useLoopClock } from "./loop";

const PERIOD_MS = 3800;
/** Off to the side, then across between 55% and 85% of the period — a light catching the button now and then. */
const SWEEP_FROM = 0.55;
const SWEEP_TO = 0.85;
const TRAVEL = 1.2;

/**
 * A band of light that sweeps across its parent every few seconds. The parent
 * must clip (`overflow-hidden` + its own radius). `delayMs` staggers two
 * sheens so they don't flash together. Rests off-screen under reduce-motion.
 */
export function Sheen({ color, opacity = 0.55, delayMs = 0 }: { color: string; opacity?: number; delayMs?: number }) {
  const clock = useLoopClock(PERIOD_MS, delayMs);
  const width = useSharedValue(0);

  const style = useAnimatedStyle(() => {
    const across = ease(clock.value, SWEEP_FROM, SWEEP_TO);
    return {
      // Hidden until measured, or it would sit in the middle for a frame.
      opacity: width.value > 0 ? 1 : 0,
      transform: [{ translateX: (-TRAVEL + 2 * TRAVEL * across) * width.value }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width;
      }}
      style={[StyleSheet.absoluteFill, style]}
    >
      <LinearGradientFill
        layers={[
          {
            angle: 110,
            stops: [
              { offset: 0.3, color, opacity: 0 },
              { offset: 0.5, color, opacity },
              { offset: 0.7, color, opacity: 0 },
            ],
          },
        ]}
      />
    </Animated.View>
  );
}
