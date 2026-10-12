import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type ViewProps } from "react-native";
import { Lock, TriangleAlert } from "lucide-react-native";
import { DailyLimitError } from "@jsmf/core/data-source";
import { useColors } from "@/theme/theme";
import { DAILY_LIMIT_TITLE } from "@/lib/daily-limit";
import { Button, type IconComponent } from "./button";
import { cn, Heading, Txt } from "./text";

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("rounded-2xl border border-border bg-card p-4", className)} {...props} />;
}

/** A tappable card row. */
export function PressableCard({
  className,
  children,
  onPress,
  accessibilityLabel,
}: {
  className?: string;
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={cn("rounded-2xl border border-border bg-card p-4 active:bg-muted", className)}
    >
      {children}
    </Pressable>
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

export function ProgressBar({ value, className, color }: { value: number; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View className="h-full rounded-full bg-primary" style={[{ width: `${pct}%` }, color ? { backgroundColor: color } : null]} />
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
    <View className="mb-2.5 mt-1 flex-row items-center justify-between">
      <Heading className="text-[15px]">{children}</Heading>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      className={cn(
        "h-9 flex-row items-center gap-1.5 rounded-full border px-3.5",
        selected ? "border-primary bg-primary/10" : "border-border bg-card",
        disabled && "opacity-40",
        className
      )}
    >
      <Txt weight={600} className={cn("text-[13px]", selected ? "text-primary" : "text-muted-foreground")} numberOfLines={1}>
        {label}
      </Txt>
      {count !== undefined ? (
        <Txt weight={600} className={cn("text-[11px]", selected ? "text-primary/70" : "text-muted-foreground/70")}>
          {count}
        </Txt>
      ) : null}
      {trailing}
    </Pressable>
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
  const bg = tone === "success" ? "bg-success/60" : tone === "error" ? "bg-error/60" : tone === "card" ? "bg-card" : "bg-muted/60";
  const content = (
    <>
      <Txt font="display" weight={700} className="text-xl">
        {value}
      </Txt>
      <Txt className="text-xs text-muted-foreground">{label}</Txt>
      {sub ? <Txt className="mt-0.5 text-[10px] text-muted-foreground">{sub}</Txt> : null}
    </>
  );
  const base = cn("flex-1 items-center rounded-2xl border px-2 py-3", bg, active ? "border-foreground" : "border-border", className);
  if (!onPress) return <View className={base}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} className={cn(base, "active:opacity-80")}>
      {content}
    </Pressable>
  );
}
