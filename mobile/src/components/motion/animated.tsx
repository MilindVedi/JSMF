import type { ComponentProps } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { cssInterop } from "nativewind";

const ReanimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A Reanimated style (from `useAnimatedStyle`), as Animated.View takes it. */
export type AnimatedStyleProp = ComponentProps<typeof Animated.View>["style"];

type Motion = {
  /** The animated part of the style. Kept apart from `className`/`style` — see below. */
  animatedStyle?: AnimatedStyleProp;
};

/*
 * Why `animatedStyle` is its own prop: on a phone, NativeWind turns
 * `className` into a style object and merges any `style` prop into it. A
 * Reanimated animated style merged that way makes Reanimated treat the whole
 * object as the animation and drop the rest — every class (size, padding,
 * background, flex) silently disappears. On the web build classes are plain
 * CSS, so it only ever shows on a device.
 *
 * Here NativeWind resolves `className` (+ any static `style`) on its own, and
 * the animated style is handed to Reanimated beside it as a list, which it
 * handles properly. One element still carries both its look and its motion.
 */
function MotionViewBase({ style, animatedStyle, ...rest }: ViewProps & Motion) {
  return <Animated.View {...rest} style={[style, animatedStyle]} />;
}

function MotionPressableBase({
  style,
  animatedStyle,
  ...rest
}: Omit<PressableProps, "style"> & Motion & { style?: StyleProp<ViewStyle> }) {
  return <ReanimatedPressable {...rest} style={[style, animatedStyle]} />;
}

/** A View that takes `className` and an `animatedStyle`. */
export const AnimatedView = cssInterop(MotionViewBase, { className: "style" });
/** A Pressable that takes `className` and an `animatedStyle` (e.g. a press scale). */
export const AnimatedPressable = cssInterop(MotionPressableBase, { className: "style" });
