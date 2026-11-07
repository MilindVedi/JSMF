import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, View, type ViewProps } from "react-native";
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Lock, TriangleAlert } from "lucide-react-native";
import { DailyLimitError } from "@jsmf/core/data-source";
import { useColors } from "@/theme/theme";
import { DAILY_LIMIT_TITLE } from "@/lib/daily-limit";
import { AnimatedPressable, AnimatedView } from "@/components/motion/animated";
import { CountUp } from "@/components/motion/count-up";
import { usePressScale } from "@/components/motion/loop";
import { Button, type IconComponent } from "./button";
import { cn, Heading, Txt } from "./text";

/**
 * A surface. `plain` is the white card with a hairline border; `tint` is the
 * soft lavender tile the design uses for shortcuts (no border).
 */
export type CardTone = "plain" | "tint";
const CARD_TONE: Record<CardTone, string> = {
  plain: "border border-border bg-card",
  tint: "bg-accent",
};

export function Card({ className, tone = "plain", ...props }: ViewProps & { className?: string; tone?: CardTone }) {
  return <View className={cn("rounded-2xl p-4", CARD_TONE[tone], className)} {...props} />;
}

/** A tappable card: it gives a little under the finger. */
export function PressableCard({
  className,
  children,
  onPress,
  accessibilityLabel,
  tone = "plain",
}: {
  className?: string;
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  tone?: CardTone;
}) {
  const press = usePressScale(0.98);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className={cn("rounded-2xl p-4", CARD_TONE[tone], className)}
      animatedStyle={press.style}
    >
      {children}
    </AnimatedPressable>
  );
}

export type Tone = "default" | "primary" | "success" | "error" | "flag" | "muted";

const TONE_BG: Record<Tone, string> = {
  default: "bg-secondary",
  primary: "bg-primary/10",
  success: "bg-success",
  error: "bg-error",
  flag: "bg-flag",
  muted: "bg-muted",
};
const TONE_TEXT: Record<Tone, string> = {
  default: "text-secondary-foreground",
  primary: "text-primary",
  success: "text-success-foreground",
  error: "text-error-foreground",
  flag: "text-flag-foreground",
  muted: "text-muted-foreground",
};

export function Badge({ label, tone = "default", className }: { label: string; tone?: Tone; className?: string }) {
  return (
    <View className={cn("self-start rounded-full px-2 py-0.5", TONE_BG[tone], className)}>
      <Txt weight={600} className={cn("text-[11px]", TONE_TEXT[tone])}>
        {label}
      </Txt>
    </View>
  );
}

/** An icon in a tinted rounded square (stat cards, quick actions). */
export function IconTile({ icon: Icon, tone = "muted", size = 40 }: { icon: IconComponent; tone?: Tone; size?: number }) {
  const colors = useColors();
  const color =
    tone === "success"
      ? colors["success-foreground"]
      : tone === "error"
        ? colors["error-foreground"]
        : tone === "flag"
          ? colors["flag-foreground"]
          : tone === "primary"
            ? colors.primary
            : colors["muted-foreground"];
  return (
    <View className={cn("items-center justify-center rounded-xl", TONE_BG[tone])} style={{ width: size, height: size }}>
      <Icon size={size * 0.48} color={color} strokeWidth={1.75} />
    </View>
  );
}

/**
 * A bar's fill growing to `value`% — from empty when it first shows, from
 * where it was when the value changes. Full at once under reduce-motion.
 */
export function useGrowingWidth(value: number) {
  const reduceMotion = useReducedMotion();
  const pct = Math.max(0, Math.min(100, value));
  const width = useSharedValue(reduceMotion ? pct : 0);
  useEffect(() => {
    width.set(reduceMotion ? pct : withTiming(pct, { duration: 800, easing: Easing.out(Easing.cubic) }));
  }, [pct, reduceMotion, width]);
  return useAnimatedStyle(() => ({ width: `${width.value}%` }));
}

/**
 * Plain progress (how much is done: coverage, today's goal, a session) — the
 * brand purple. A bar that shows a score is a ScoreBar (components/ui/score),
 * coloured by its band instead.
 */
export function ProgressBar({ value, className, color }: { value: number; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = useGrowingWidth(pct);
  return (
    <View
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <AnimatedView className="h-full rounded-full bg-primary" style={color ? { backgroundColor: color } : null} animatedStyle={fill} />
    </View>
  );
}

export function Loading({ className }: { className?: string }) {
  const colors = useColors();
  return (
    <View className={cn("flex-1 items-center justify-center py-16", className)}>
      <ActivityIndicator color={colors["muted-foreground"]} />
    </View>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: IconComponent;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const colors = useColors();
  return (
    <View className={cn("items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-10", className)}>
      <View className="size-11 items-center justify-center rounded-full bg-muted">
        <Icon size={20} color={colors["muted-foreground"]} strokeWidth={1.75} />
      </View>
      <View className="items-center gap-1">
        <Txt font="display" weight={600} className="text-center text-sm">
          {title}
        </Txt>
        {description ? <Txt className="text-center text-sm text-muted-foreground">{description}</Txt> : null}
      </View>
      {action}
    </View>
  );
}

/** Shown when the free daily allowance is used up — neutral, with nothing to buy. */
export function DailyLimitNotice({ className }: { className?: string }) {
  return <EmptyState icon={Lock} title={DAILY_LIMIT_TITLE} description="Come back tomorrow." className={className} />;
}

/** A friendly failure with a retry, used by every data screen. */
export function QueryError({ error, onRetry, title = "Something went wrong" }: { error: unknown; onRetry?: () => void; title?: string }) {
  if (error instanceof DailyLimitError) return <DailyLimitNotice />;
  return (
    <EmptyState
      icon={TriangleAlert}
      title={title}
      description={error instanceof Error ? error.message : "Please try again in a moment."}
      action={onRetry ? <Button label="Try again" variant="outline" size="sm" onPress={onRetry} /> : undefined}
    />
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View className="mb-3 mt-3 flex-row items-center justify-between gap-3">
      <Heading weight={700} className="shrink text-base leading-6 text-brand-ink" accessibilityRole="header">
        {children}
      </Heading>
      {action}
    </View>
  );
}

/** A selectable pill (filters, presets, exam choice). */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  count,
  className,
  trailing,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  count?: number;
  className?: string;
  trailing?: ReactNode;
}) {
  const press = usePressScale(0.95);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      hitSlop={4}
      className={cn(
        "min-h-8 flex-row items-center gap-1.5 rounded-full border px-3 py-1",
        selected ? "border-primary bg-accent" : "border-border bg-card",
        disabled && "opacity-40",
        className
      )}
      animatedStyle={press.style}
    >
      <Txt weight={600} className={cn("text-xs", selected ? "text-primary" : "text-foreground")} numberOfLines={1}>
        {label}
      </Txt>
      {count !== undefined ? (
        <Txt weight={600} className={cn("text-[11px]", selected ? "text-primary/70" : "text-muted-foreground")}>
          {count}
        </Txt>
      ) : null}
      {trailing}
    </AnimatedPressable>
  );
}

export function Divider({ className }: { className?: string }) {
  return <View className={cn("h-px bg-border", className)} />;
}

/** A figure tile: big value, small label. */
export function StatTile({
  label,
  value,
  sub,
  tone = "muted",
  onPress,
  active = false,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "success" | "error" | "muted" | "card";
  onPress?: () => void;
  active?: boolean;
  className?: string;
}) {
  const press = usePressScale(0.97);
  // Correct and incorrect tiles are tinted, with an edge of the same colour (the design's green and red tiles).
  const surface =
    tone === "success"
      ? "bg-success/70 border-success-foreground/25"
      : tone === "error"
        ? "bg-error/70 border-error-foreground/25"
        : tone === "card"
          ? "bg-card border-border"
          : "bg-muted/60 border-border";
  const content = (
    <>
      {typeof value === "number" ? (
        <CountUp value={value} font="display" weight={700} className="text-xl leading-7" />
      ) : (
        <Txt font="display" weight={700} className="text-xl leading-7">
          {value}
        </Txt>
      )}
      <Txt className="text-center text-[10px] text-muted-foreground">{label}</Txt>
      {sub ? <Txt className="mt-0.5 text-center text-[10px] text-muted-foreground">{sub}</Txt> : null}
    </>
  );
  const base = cn("flex-1 items-center justify-center rounded-2xl border px-2 py-3", surface, active && "border-primary", className);
  if (!onPress) return <View className={base}>{content}</View>;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className={base}
      animatedStyle={press.style}
    >
      {content}
    </AnimatedPressable>
  );
}
