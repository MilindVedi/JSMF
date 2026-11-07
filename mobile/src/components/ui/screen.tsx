import type { ReactNode, Ref } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useAuthStore } from "@/lib/auth-store";
import { useColors, withAlpha } from "@/theme/theme";
import { AnimatedPressable } from "@/components/motion/animated";
import { usePressScale } from "@/components/motion/loop";
import { Stagger } from "@/components/motion/rise";
import { useTabBarClearance } from "@/components/navigation/tab-bar";
import { StreakChip } from "@/components/streak/streak-chip";
import { BRAND_GRADIENT, type IconComponent } from "./button";
import { LinearGradientFill } from "./gradient";
import { Chip } from "./primitives";
import { cn, Eyebrow, Heading, Txt } from "./text";

/** The circular stethoscope mark. */
export const LOGO = require("../../../assets/images/logo.png");

/** The JSMF mark, name and product, as web's <Logo>. */
export function Logo({ size = 30, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <View className="flex-row items-center gap-2">
      <Image source={LOGO} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />
      {showName ? (
        <Txt font="display" weight={600} className="text-base text-brand-ink">
          JSMF <Txt font="display" weight={400} className="text-base text-muted-foreground">PYQs</Txt>
        </Txt>
      ) : null}
    </View>
  );
}

/** The brand lockup at the top of every tab: the mark, "JSMF PYQs" and the full form. */
function BrandLockup() {
  return (
    <View className="shrink flex-row items-center gap-2.5" accessible accessibilityLabel="JSMF PYQs, Jab Studies Met Fun">
      <Image source={LOGO} style={{ width: 36, height: 36 }} contentFit="contain" accessibilityIgnoresInvertColors />
      <View className="shrink">
        <Txt font="display" weight={700} className="text-base leading-5 text-brand-ink" numberOfLines={1}>
          JSMF <Txt font="display" weight={500} className="text-base leading-5 text-muted-foreground">PYQs</Txt>
        </Txt>
        <Txt weight={600} className="mt-0.5 text-[10px] uppercase tracking-[1.8px] text-muted-foreground" numberOfLines={1}>
          Jab Studies Met Fun
        </Txt>
      </View>
    </View>
  );
}

/** The student's initial in a violet tile — opens Profile (the design keeps it out of the tab bar). */
function ProfileButton() {
  const router = useRouter();
  const name = useAuthStore((s) => s.user?.name) ?? "";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const press = usePressScale(0.92);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Profile"
      hitSlop={6}
      onPress={() => router.push("/profile")}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="size-10 items-center justify-center"
      style={{ borderRadius: 14, boxShadow: `0 6px 14px -6px ${withAlpha(BRAND_GRADIENT.vivid, 0.6)}` }}
      animatedStyle={press.style}
    >
      <LinearGradientFill radius={14} layers={[{ angle: 135, stops: [{ offset: 0, color: BRAND_GRADIENT.deep }, { offset: 1, color: BRAND_GRADIENT.vivid }] }]} />
      <Txt font="display" weight={700} className="text-base" style={{ color: BRAND_GRADIENT.onDeep }}>
        {initial}
      </Txt>
    </AnimatedPressable>
  );
}

/** A tab's title block: the violet eyebrow with its icon, the big title ending in a violet full stop, a line under it. */
function PageTitle({ eyebrow, eyebrowIcon: Icon, title, subtitle }: { eyebrow?: string; eyebrowIcon?: IconComponent; title: string; subtitle?: string }) {
  const colors = useColors();
  // The design's violet full stop — unless the title already ends in punctuation.
  const stop = /[.!?…]$/.test(title) ? "" : ".";
  return (
    <View className="mt-5">
      {eyebrow ? (
        <View className="mb-2 flex-row items-center gap-2">
          {Icon ? <Icon size={13} color={colors.primary} strokeWidth={2.2} /> : null}
          <Eyebrow className="tracking-[1.2px] text-primary">{eyebrow}</Eyebrow>
        </View>
      ) : null}
      <Heading weight={700} className="text-2xl leading-[30px] text-brand-ink" accessibilityRole="header">
        {title}
        {stop ? <Txt font="display" weight={700} className="text-2xl leading-[30px] text-primary">{stop}</Txt> : null}
      </Heading>
      {subtitle ? <Txt className="mt-1 text-xs leading-[18px] text-muted-foreground">{subtitle}</Txt> : null}
    </View>
  );
}

/**
 * The top of a tab: the brand lockup with the streak chip and the profile
 * button, then the page's title block. TabScreen puts it above its body; a
 * tab that scrolls a list itself puts it at the top of the list, so it
 * scrolls away with the content.
 */
export function TabHeader({
  title,
  eyebrow,
  eyebrowIcon,
  subtitle,
  headerExtra,
  className,
}: {
  title: string;
  eyebrow?: string;
  eyebrowIcon?: IconComponent;
  subtitle?: string;
  headerExtra?: ReactNode;
  className?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className={cn("px-5", className)} style={{ paddingTop: insets.top + 10 }}>
      <View className="flex-row items-center gap-2.5">
        <View className="flex-1">
          <BrandLockup />
        </View>
        {headerExtra}
        <StreakChip />
        <ProfileButton />
      </View>
      <PageTitle eyebrow={eyebrow} eyebrowIcon={eyebrowIcon} title={title} subtitle={subtitle} />
    </View>
  );
}

/**
 * A tab's page: the brand lockup with the streak chip and the profile button,
 * the page's title block, then the body — whose parts rise in one after
 * another when the tab first opens. The whole page scrolls (pull to refresh);
 * `scroll={false}` keeps the header still above a body that scrolls itself.
 */
export function TabScreen({
  title,
  eyebrow,
  eyebrowIcon,
  subtitle,
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  headerExtra,
  scrollRef,
  contentRef,
}: {
  title: string;
  /** A small violet line above the title (web's masthead eyebrow). */
  eyebrow?: string;
  eyebrowIcon?: IconComponent;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  headerExtra?: ReactNode;
  /** Lets a screen scroll itself, e.g. to a section a link asked for. */
  scrollRef?: Ref<ScrollView>;
  /** The whole scrolling content, to measure a part's position against (for scrollRef). */
  contentRef?: Ref<View>;
}) {
  const colors = useColors();
  const clearance = useTabBarClearance();
  const header = <TabHeader title={title} eyebrow={eyebrow} eyebrowIcon={eyebrowIcon} subtitle={subtitle} headerExtra={headerExtra} />;
  if (!scroll) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="mt-4 flex-1">{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: clearance }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      <View ref={contentRef} collapsable={false}>
        {header}
        <View className="mt-4 gap-4 px-5">
          <Stagger>{children}</Stagger>
        </View>
      </View>
    </ScrollView>
  );
}

/** A pushed screen's header: back, title, optional trailing controls. */
export function StackHeader({ title, onBack, right, subtitle }: { title: string; onBack?: () => void; right?: ReactNode; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/home")));
  return (
    <View className="flex-row items-center gap-3 bg-background px-4 pb-3" style={{ paddingTop: insets.top + 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={back}
        hitSlop={8}
        className="size-10 items-center justify-center rounded-[14px] border border-border bg-card active:bg-muted"
      >
        <ArrowLeft size={19} color={colors.foreground} />
      </Pressable>
      <View className="flex-1">
        <Txt font="display" weight={700} className="text-[17px] text-brand-ink" numberOfLines={1} accessibilityRole="header">
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
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <StackHeader title={title} subtitle={subtitle} right={right} />
      <ScrollView
        className="flex-1"
        contentContainerClassName={cn("px-5 pt-4 gap-4", contentClassName)}
        // The app draws under Android's navigation bar (edge to edge): without
        // a footer to take that space, the end of the page must clear it.
        contentContainerStyle={{ paddingBottom: (footer ? 0 : insets.bottom) + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

/**
 * One-of-several views as a row of pills ("All · Unattempted · Incorrect ·
 * Bookmarked"): the chosen one lavender with a violet edge, as the design's
 * filter pills. On a page the row runs edge to edge and scrolls sideways;
 * inside a card (`wrap`) the pills flow onto more lines instead, so none is
 * cut off at the card's edge.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  wrap = false,
  className,
}: {
  value: T;
  options: { value: T; label: string; count?: number; disabled?: boolean }[];
  onChange: (value: T) => void;
  wrap?: boolean;
  className?: string;
}) {
  const pills = options.map((option) => (
    <Chip
      key={option.value}
      label={option.label}
      count={option.count}
      selected={option.value === value}
      disabled={option.disabled}
      onPress={() => onChange(option.value)}
    />
  ));
  if (wrap) return <View className={cn("flex-row flex-wrap gap-1.5", className)}>{pills}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={cn("-mx-5 grow-0", className)} contentContainerClassName="gap-2 px-5">
      {pills}
    </ScrollView>
  );
}
