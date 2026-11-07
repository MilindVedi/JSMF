import { useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { withAlpha } from "@/theme/theme";
import { BRAND_GRADIENT } from "./button";
import { LinearGradientFill } from "./gradient";
import { cn } from "./text";

const THUMB = 24;

/**
 * A slider (web's Slider): drag or tap anywhere on the track to pick a value
 * between `min` and `max` in `step`s. Screen readers adjust it a step at a
 * time. The filled part is the brand purple — it shows an amount, not a score.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  accessibilityLabel,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  className?: string;
}) {
  const [width, setWidth] = useState(0);
  const span = Math.max(max - min, step);
  const ratio = Math.min(1, Math.max(0, (value - min) / span));
  const travel = Math.max(width - THUMB, 0);

  const pick = (x: number) => {
    if (travel === 0) return;
    const r = Math.min(1, Math.max(0, (x - THUMB / 2) / travel));
    const next = Math.round((min + r * span) / step) * step;
    const clamped = Math.min(max, Math.max(min, Number(next.toFixed(4))));
    if (clamped !== value) onChange(clamped);
  };

  // On the JS thread: each move sets React state anyway, and this keeps one source of truth.
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => pick(e.x))
    .onUpdate((e) => pick(e.x));

  const nudge = (direction: 1 | -1) => onChange(Math.min(max, Math.max(min, Number((value + direction * step).toFixed(4)))));

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        className={cn("justify-center", disabled && "opacity-40", className)}
        style={{ height: THUMB + 12 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      >
        <View className="h-2 rounded-full bg-muted" style={{ marginHorizontal: THUMB / 2 }}>
          <View style={{ width: `${ratio * 100}%`, height: "100%" }}>
            <LinearGradientFill radius={4} layers={[{ angle: 90, stops: [{ offset: 0, color: BRAND_GRADIENT.deep }, { offset: 1, color: BRAND_GRADIENT.vivid }] }]} />
          </View>
        </View>
        <View
          pointerEvents="none"
          className="absolute rounded-full border-[3px] bg-card"
          style={{
            width: THUMB,
            height: THUMB,
            left: ratio * travel,
            borderColor: BRAND_GRADIENT.vivid,
            boxShadow: `0 3px 8px ${withAlpha(BRAND_GRADIENT.vivid, 0.35)}`,
          }}
        />
      </View>
    </GestureDetector>
  );
}
