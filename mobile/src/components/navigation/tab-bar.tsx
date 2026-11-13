import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { AnimatedView } from "@/components/motion/animated";
import { useIsCompact } from "@/components/ui/app-frame";
import { usePressScale } from "@/components/motion/loop";
import { BRAND_GRADIENT } from "@/components/ui/button";
import { LinearGradientFill } from "@/components/ui/gradient";
import { Txt } from "@/components/ui/text";
import { useColors, withAlpha } from "@/theme/theme";

/** The bar's measurements (the design's floating tab bar). */
const BAR = {
  pad: 6,
  radius: 22,
  pillRadius: 16,
  itemHeight: 52,
  side: 12,
  /** Gap under the bar when the phone has no gesture-bar inset. */
  minBottom: 12,
  maxWidth: 416,
  /** How far a label may shrink to fit its slot. */
  minLabelScale: 0.85,
};
/** On a narrow phone (280-340 wide) the bar hugs the edges more and labels may shrink further, so "My Progress" still fits whole. */
const COMPACT_BAR = { ...BAR, pad: 4, side: 8, minLabelScale: 0.72 };

function useBar() {
  return useIsCompact() ? COMPACT_BAR : BAR;
}
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

function useBarBottom() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, BAR.minBottom);
}

/**
 * How much room the end of a tab's scrolling content must leave so its last
 * item isn't hidden under the floating bar. Every tab's scroll view adds it.
 */
export function useTabBarClearance() {
  const bar = useBar();
  return useBarBottom() + bar.itemHeight + bar.pad * 2 + 2 + 20;
}

/**
 * The floating tab bar: a card-coloured bar hovering over the page, the five
 * tabs in equal slots, the current one picked out by the brand-violet pill
 * that glides between them. Hidden while the Android keyboard is up (it would
 * otherwise ride up above it).
 *
 * Layout (the slots, the pill's place) is plain style, never animated classes,
 * so the slots are the same on every phone.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const bar = useBar();
  const bottom = useBarBottom();
  const keyboardUp = useAndroidKeyboardUp();
  const [rowWidth, setRowWidth] = useState(0);
  const count = state.routes.length;
  const slot = rowWidth > 0 ? rowWidth / count : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const to = state.index * slot;
    x.set(reduceMotion || slot === 0 ? to : withTiming(to, { duration: 320, easing: EASE }));
  }, [state.index, slot, reduceMotion, x]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (keyboardUp) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingHorizontal: bar.side, paddingBottom: bottom }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: BAR.maxWidth,
          padding: bar.pad,
          borderRadius: BAR.radius,
          borderWidth: 1,
          borderColor: withAlpha(colors.primary, 0.15),
          // Solid: with no blur behind it, a see-through bar shows the page as a smudge.
          backgroundColor: colors.card,
          boxShadow: `0 18px 40px -16px ${withAlpha(colors.primary, 0.5)}`,
        }}
      >
        {/* The slots are measured on this inner row, so the pill lines up exactly with them. */}
        <View accessibilityRole="tablist" style={{ flexDirection: "row" }} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
          {slot > 0 ? (
            <AnimatedView
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: slot,
                borderRadius: BAR.pillRadius,
                boxShadow: `0 8px 18px -8px ${withAlpha(BRAND_GRADIENT.vivid, 0.9)}`,
              }}
              animatedStyle={pillStyle}
            >
              <LinearGradientFill
                radius={BAR.pillRadius}
                layers={[{ angle: 135, stops: [{ offset: 0, color: BRAND_GRADIENT.deep }, { offset: 1, color: BRAND_GRADIENT.vivid }] }]}
              />
            </AnimatedView>
          ) : null}
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label = typeof options.title === "string" ? options.title : route.name;
            const color = focused ? BRAND_GRADIENT.onDeep : colors["muted-foreground"];
            return (
              <TabItem
                key={route.key}
                label={label}
                minLabelScale={bar.minLabelScale}
                focused={focused}
                icon={options.tabBarIcon?.({ focused, color, size: 20 })}
                color={color}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
                }}
                onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** One slot: the icon over its label. The icon pops a little when its tab is chosen. */
function TabItem({
  label,
  minLabelScale,
  focused,
  icon,
  color,
  onPress,
  onLongPress,
}: {
  label: string;
  minLabelScale: number;
  focused: boolean;
  icon: ReactNode;
  color: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const press = usePressScale(0.92);
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(1);

  useEffect(() => {
    if (!focused || reduceMotion) return;
    pop.set(withSequence(withTiming(0.85, { duration: 0 }), withTiming(1.08, { duration: 210, easing: EASE }), withTiming(1, { duration: 140 })));
  }, [focused, reduceMotion, pop]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ flex: 1, minHeight: BAR.itemHeight }}
    >
      <AnimatedView
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 8, paddingHorizontal: 2 }}
        animatedStyle={press.style}
      >
        <AnimatedView animatedStyle={iconStyle}>{icon}</AnimatedView>
        <Txt
          weight={focused ? 700 : 600}
          className="text-[10px] leading-[13px]"
          style={{ color }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={minLabelScale}
          maxFontSizeMultiplier={1.2}
        >
          {label}
        </Txt>
      </AnimatedView>
    </Pressable>
  );
}

/** Whether the on-screen keyboard is showing on Android (iOS lays the keyboard over the bar). */
function useAndroidKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setUp(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return up;
}
