import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { ZoomIn, FadeOut, useReducedMotion, FadeIn } from "react-native-reanimated";
import { getStreakLevel, isMilestoneDay } from "@jsmf/core/domain";
import { useRefreshStreak } from "@jsmf/core/hooks";
import { useStreakAnimationStore, useStreakState, type Rect } from "@/lib/streak";
import { useColors, useStreakAccent, withAlpha } from "@/theme/theme";
import { Txt } from "@/components/ui/text";
import { StreakEmbers } from "./embers";
import { StreakFlame } from "./flame";

/** How long the badge celebrates in place before it flies to the header chip. */
const HOLD_MS = 700;
/** Without a chip to fly to (the practice screen), how long it stays. */
const IN_PLACE_MS = 2200;

/**
 * Celebrates the daily goal the moment it is reached, wherever the student is
 * — usually mid-practice, on the answer that crosses the target (web's
 * StreakGoalCelebrator). Fires only on a live false → true change of
 * `todayDone` seen while mounted, so opening the app on a day already
 * completed never replays it, and `markCelebrated` keeps it from repeating on
 * the home card. On the practice screens it celebrates in place; elsewhere the
 * badge flies into the header chip. Home's StreakCard handles its own screen.
 */
export function StreakGoalCelebrator() {
  const pathname = usePathname();
  const streak = useStreakState();
  const beginPending = useStreakAnimationStore((s) => s.beginPending);
  const triggerFly = useStreakAnimationStore((s) => s.trigger);
  const markCelebrated = useStreakAnimationStore((s) => s.markCelebrated);
  const refreshStreak = useRefreshStreak();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const [badgeDays, setBadgeDays] = useState<number | null>(null);
  const badgeRef = useRef<View>(null);
  const wasDone = useRef<boolean | null>(null);
  const accent = useStreakAccent(badgeDays ?? 0);

  useEffect(() => {
    if (!streak.loaded) return;
    const previous = wasDone.current;
    wasDone.current = streak.todayDone;
    if (previous !== false || !streak.todayDone || streak.celebratedToday) return;
    if (pathname === "/home") return;
    const inPlace = pathname.startsWith("/session");

    // The server counts today from the day's first answer, so the count
    // already includes today: the badge travels from yesterday's to today's.
    const newStreak = Math.max(streak.currentStreak, 1);
    markCelebrated(streak.lastCompletedDate ?? new Date().toISOString().slice(0, 10));
    const show = setTimeout(() => setBadgeDays(newStreak), 0);
    if (!inPlace) beginPending(newStreak - 1);
    const fly = setTimeout(() => {
      if (!inPlace) {
        const milestone = isMilestoneDay(newStreak) ? newStreak : null;
        if (badgeRef.current) {
          badgeRef.current.measureInWindow((x, y, width, height) => triggerFly({ x, y, width, height } satisfies Rect, milestone));
        } else triggerFly(null, milestone);
      }
      void refreshStreak();
    }, HOLD_MS);
    const hide = setTimeout(() => setBadgeDays(null), inPlace ? IN_PLACE_MS : HOLD_MS + 150);
    return () => {
      clearTimeout(show);
      clearTimeout(fly);
      clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak.loaded, streak.todayDone]);

  if (badgeDays === null) return null;
  const level = getStreakLevel(badgeDays);
  const entering = reduceMotion ? FadeIn.duration(1) : ZoomIn.springify().damping(11).stiffness(180);

  return (
    <View pointerEvents="none" className="absolute inset-x-0 items-center" style={{ top: insets.top + 64 }} accessibilityLiveRegion="polite">
      <View className="items-center gap-2">
        <Animated.View entering={entering} exiting={FadeOut.duration(150)}>
          <View
            ref={badgeRef}
            collapsable={false}
            className="flex-row items-center gap-2 rounded-full border px-4 py-2"
            style={{
              backgroundColor: colors.card,
              borderColor: withAlpha(accent, 0.35),
              shadowColor: "#ff6e1e",
              shadowOpacity: 0.5,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <View className="absolute inset-0 rounded-full" style={{ backgroundColor: withAlpha(accent, 0.18) }} />
            <StreakEmbers />
            <StreakFlame size={24} glow={Math.max(level.glowIntensity, 2)} />
            <Txt weight={700} className="text-sm" style={{ color: accent }}>
              {badgeDays} day{badgeDays === 1 ? "" : "s"}
            </Txt>
          </View>
        </Animated.View>
        <Animated.View entering={reduceMotion ? FadeIn.duration(1) : ZoomIn.delay(120).springify()} exiting={FadeOut.duration(150)}>
          <View className="rounded-full bg-card px-3 py-1" style={{ shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }}>
            <Txt weight={600} className="text-xs">
              Daily goal reached
            </Txt>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
