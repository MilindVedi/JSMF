import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { withAlpha } from "@/theme/theme";
import { BRAND_GRADIENT } from "./button";
import { LinearGradientFill, RadialGlow } from "./gradient";
import { cn, Txt, type TxtProps } from "./text";

const RADIUS = 26;

/**
 * The deep-violet card that leads a page (the next session on the dashboard,
 * overall accuracy on statistics): the brand gradient, a soft light in the top
 * corner and a violet glow beneath. Its text is light in both schemes.
 */
export function HeroCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View
      // No overflow clipping: it would cut off the glow. The fills round their own corners instead.
      className={cn("p-5", className)}
      style={{ borderRadius: RADIUS, boxShadow: `0 18px 36px -18px ${withAlpha(BRAND_GRADIENT.vivid, 0.8)}` }}
    >
      <LinearGradientFill
        radius={RADIUS}
        layers={[{ angle: 135, stops: [{ offset: 0, color: BRAND_GRADIENT.deep }, { offset: 1, color: BRAND_GRADIENT.vivid }] }]}
      />
      <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
        <RadialGlow color="#ffffff" opacity={0.16} cx={0.85} cy={0.1} fade={0.55} radius={RADIUS} />
      </View>
      {children}
    </View>
  );
}

/** Text on a HeroCard, in its light ink. */
export function HeroText({ dim = false, ...props }: TxtProps & { dim?: boolean }) {
  return <Txt {...props} style={[{ color: withAlpha(BRAND_GRADIENT.onDeep, dim ? 0.72 : 1) }, props.style]} />;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A ring that fills to `value`% when it first shows (from the top, clockwise),
 * with the number in the middle. `color` is the fill; the track is a faint
 * version of the ink. Filled at once under reduce-motion.
 */
export function ProgressRing({
  value,
  color,
  track,
  size = 84,
  stroke = 7,
  label,
  labelColor,
}: {
  value: number;
  color: string;
  track: string;
  size?: number;
  stroke?: number;
  label?: string;
  labelColor?: string;
}) {
  const reduceMotion = useReducedMotion();
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(reduceMotion ? pct : 0);
  useEffect(() => {
    progress.set(reduceMotion ? pct : withTiming(pct, { duration: 1000, easing: Easing.out(Easing.cubic) }));
  }, [pct, reduceMotion, progress]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value / 100) }));

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          animatedProps={arc}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {label ? (
        <Txt font="display" weight={700} className="text-lg" style={labelColor ? { color: labelColor } : undefined}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}
