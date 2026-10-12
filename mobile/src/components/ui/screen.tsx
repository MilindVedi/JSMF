import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useColors } from "@/theme/theme";
import { StreakChip } from "@/components/streak/streak-chip";
import { cn, Heading, Txt } from "./text";

const LOGO = require("../../../assets/images/logo.png");

/** The JSMF mark, name and product, as web's <Logo>. */
export function Logo({ size = 30, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <View className="flex-row items-center gap-2">
      <Image source={LOGO} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />
      {showName ? (
        <Txt font="display" weight={600} className="text-base text-brand-ink">
          JSMF <Txt font="display" weight={400} className="text-base text-muted-foreground">Med Prep</Txt>
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * A tab's page: a quiet header (title + the streak chip, which is also where
 * the daily-goal badge lands) above a scrolling body with pull-to-refresh.
 */
export function TabScreen({
  title,
  subtitle,
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  headerExtra,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  headerExtra?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const header = (
    <View className="flex-row items-center gap-3 px-5 pb-3" style={{ paddingTop: insets.top + 10 }}>
      <View className="flex-1">
        <Heading className="text-[22px] leading-7" accessibilityRole="header">
          {title}
        </Heading>
        {subtitle ? <Txt className="mt-0.5 text-sm text-muted-foreground">{subtitle}</Txt> : null}
      </View>
      {headerExtra}
      <StreakChip />
    </View>
  );
  if (!scroll) {
    return (
      <View className="flex-1 bg-background">
        {header}
        {children}
      </View>
    );
  }
  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 gap-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** A pushed screen's header: back, title, optional trailing controls. */
export function StackHeader({ title, onBack, right, subtitle }: { title: string; onBack?: () => void; right?: ReactNode; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/home")));
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-background px-3 pb-2.5" style={{ paddingTop: insets.top + 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={8} className="size-10 items-center justify-center rounded-xl active:bg-muted">
        <ArrowLeft size={20} color={colors.foreground} />
      </Pressable>
      <View className="flex-1">
        <Txt font="display" weight={600} className="text-base" numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt className="text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A pushed screen: header + scrolling body. */
export function StackScreen({
  title,
  subtitle,
  right,
  children,
  footer,
  contentClassName,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <View className="flex-1 bg-background">
      <StackHeader title={title} subtitle={subtitle} right={right} />
      <ScrollView className="flex-1" contentContainerClassName={cn("px-5 pb-10 pt-4 gap-4", contentClassName)} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

/** Horizontal segmented tabs ("All · Unattempted · Incorrect · Bookmarked"). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string; count?: number; disabled?: boolean }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={cn("-mx-5 grow-0", className)} contentContainerClassName="px-5">
      <View className="flex-row rounded-xl bg-muted p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: option.disabled }}
              disabled={option.disabled}
              onPress={() => onChange(option.value)}
              className={cn("flex-row items-center gap-1.5 rounded-lg px-3 py-1.5", active && "bg-card", option.disabled && "opacity-40")}
            >
              <Txt weight={600} className={cn("text-[13px]", active ? "text-foreground" : "text-muted-foreground")}>
                {option.label}
              </Txt>
              {option.count !== undefined ? <Txt className="text-[11px] text-muted-foreground">{option.count}</Txt> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
