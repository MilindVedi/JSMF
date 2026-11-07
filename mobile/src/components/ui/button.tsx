import type { ComponentType, ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type PressableProps } from "react-native";
import { AnimatedPressable } from "@/components/motion/animated";
import { usePressScale } from "@/components/motion/loop";
import { useColors, withAlpha, type ColorToken } from "@/theme/theme";
import palette from "@/theme/palette.json";
import { LinearGradientFill } from "./gradient";
import { cn, Txt } from "./text";

export type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number; fill?: string }>;

/** `onHero`: the white button on a violet HeroCard. */
type Variant = "primary" | "outline" | "ghost" | "secondary" | "destructive" | "onHero";
type Size = "sm" | "md" | "lg";

/**
 * The brand gradient of the main action, the same in both schemes: in dark
 * mode `primary` is a pale lavender white text can't sit on, so the button
 * keeps light mode's deep-to-vivid violet.
 */
export const BRAND_GRADIENT = {
  deep: palette.light["brand-deep"],
  vivid: palette.light.primary,
  onDeep: palette.light["brand-on-deep"],
};

const CONTAINER: Record<Variant, string> = {
  primary: "",
  outline: "border border-border bg-card",
  ghost: "bg-transparent",
  secondary: "bg-accent",
  destructive: "border border-destructive/40 bg-card",
  onHero: "bg-white",
};
const TEXT: Record<Variant, string> = {
  primary: "text-brand-on-deep",
  outline: "text-foreground",
  ghost: "text-foreground",
  secondary: "text-accent-foreground",
  destructive: "text-destructive",
  onHero: "text-brand-deep",
};
const ICON_COLOR: Record<Variant, ColorToken | null> = {
  primary: null,
  outline: "foreground",
  ghost: "foreground",
  secondary: "accent-foreground",
  destructive: "destructive",
  onHero: "brand-deep",
};
// Minimum heights, not fixed ones: with the phone's text size turned up the label grows inside.
const SIZE: Record<Size, string> = { sm: "min-h-9 px-3.5 py-1.5", md: "min-h-11 px-4 py-2", lg: "min-h-[52px] px-5 py-2.5" };
const RADIUS: Record<Size, number> = { sm: 12, md: 14, lg: 16 };
const TEXT_SIZE: Record<Size, string> = { sm: "text-[13px]", md: "text-sm", lg: "text-[15px]" };

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label?: string;
  variant?: Variant;
  size?: Size;
  icon?: IconComponent;
  iconRight?: IconComponent;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * A button that gives a little when pressed. The primary one is the brand's
 * violet gradient with a soft glow under it; the rest are quiet surfaces.
 */
export function Button({
  label,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled,
  className,
  children,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const colors = useColors();
  const press = usePressScale();
  const primary = variant === "primary";
  const token = ICON_COLOR[variant];
  const iconColor = token ? colors[token] : BRAND_GRADIENT.onDeep;
  const off = disabled || loading;
  const radius = RADIUS[size];
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: loading }}
      disabled={off}
      onPressIn={(e) => {
        press.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.onPressOut();
        onPressOut?.(e);
      }}
      className={cn("flex-row items-center justify-center gap-2", CONTAINER[variant], SIZE[size], off && "opacity-50", className)}
      style={[
        { borderRadius: radius },
        primary && !off ? { boxShadow: `0 10px 22px -10px ${withAlpha(BRAND_GRADIENT.vivid, 0.75)}` } : null,
      ]}
      animatedStyle={press.style}
      {...props}
    >
      {primary ? (
        <LinearGradientFill
          radius={radius}
          layers={[{ angle: 115, stops: [{ offset: 0, color: BRAND_GRADIENT.deep }, { offset: 1, color: BRAND_GRADIENT.vivid }] }]}
        />
      ) : null}
      {/* Icons sit in a view so they stack above the gradient on web too (a bare svg paints under it). */}
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : Icon ? (
        <View>
          <Icon size={size === "sm" ? 15 : 17} color={iconColor} />
        </View>
      ) : null}
      {label ? (
        <Txt weight={primary ? 700 : 600} className={cn("shrink text-center", TEXT[variant], TEXT_SIZE[size])} numberOfLines={2}>
          {label}
        </Txt>
      ) : null}
      {children}
      {IconRight ? (
        <View>
          <IconRight size={size === "sm" ? 15 : 17} color={iconColor} />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

/** A square icon-only button (bookmark, flag, report). */
export function IconButton({
  icon: Icon,
  label,
  active = false,
  activeColor,
  filled = false,
  onPress,
  className,
  disabled,
}: {
  icon: IconComponent;
  /** Accessibility label. */
  label: string;
  active?: boolean;
  activeColor?: string;
  filled?: boolean;
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const colors = useColors();
  const color = active ? (activeColor ?? colors.primary) : colors["muted-foreground"];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={cn("size-10 items-center justify-center rounded-xl active:bg-muted", className)}
    >
      <View>
        <Icon size={20} color={color} fill={active && filled ? color : "transparent"} strokeWidth={1.9} />
      </View>
    </Pressable>
  );
}
