import type { ComponentType, ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type PressableProps } from "react-native";
import { useColors, type ColorToken } from "@/theme/theme";
import { cn, Txt } from "./text";

export type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number; fill?: string }>;

type Variant = "primary" | "outline" | "ghost" | "secondary" | "destructive";
type Size = "sm" | "md" | "lg";

const CONTAINER: Record<Variant, string> = {
  primary: "bg-primary",
  outline: "border border-border bg-card",
  ghost: "bg-transparent",
  secondary: "bg-secondary",
  destructive: "border border-destructive/40 bg-card",
};
const TEXT: Record<Variant, string> = {
  primary: "text-primary-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive",
};
const ICON_COLOR: Record<Variant, ColorToken> = {
  primary: "primary-foreground",
  outline: "foreground",
  ghost: "foreground",
  secondary: "secondary-foreground",
  destructive: "destructive",
};
const SIZE: Record<Size, string> = { sm: "h-9 px-3 rounded-lg", md: "h-11 px-4 rounded-xl", lg: "h-12 px-5 rounded-xl" };
const TEXT_SIZE: Record<Size, string> = { sm: "text-[13px]", md: "text-sm", lg: "text-[15px]" };

export interface ButtonProps extends Omit<PressableProps, "children"> {
  label?: string;
  variant?: Variant;
  size?: Size;
  icon?: IconComponent;
  iconRight?: IconComponent;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

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
  ...props
}: ButtonProps) {
  const colors = useColors();
  const iconColor = colors[ICON_COLOR[variant]];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: loading }}
      disabled={off}
      className={cn(
        "flex-row items-center justify-center gap-2 active:opacity-80",
        CONTAINER[variant],
        SIZE[size],
        off && "opacity-50",
        className
      )}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" color={iconColor} /> : Icon ? <Icon size={size === "sm" ? 15 : 17} color={iconColor} /> : null}
      {label ? (
        <Txt weight={600} className={cn(TEXT[variant], TEXT_SIZE[size])} numberOfLines={1}>
          {label}
        </Txt>
      ) : null}
      {children}
      {IconRight ? <IconRight size={size === "sm" ? 15 : 17} color={iconColor} /> : null}
    </Pressable>
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
