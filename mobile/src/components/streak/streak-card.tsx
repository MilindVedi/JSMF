import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useIsFocused } from "expo-router";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { CircleCheck, Target, Trophy } from "lucide-react-native";
import { getStreakLevel, isMilestoneDay } from "@jsmf/core/domain";
import { useStreakAnimationStore, useStreakState } from "@/lib/streak";
import { useColors, useStreakAccent, withAlpha } from "@/theme/theme";
import { Card, ProgressBar } from "@/components/ui/primitives";
import { cn, Txt } from "@/components/ui/text";
import { StreakEmbers } from "./embers";
import { StreakFlame } from "./flame";
import { useStreakIdlePulse } from "./idle-pulse";

/**
 * Home's streak / today's-progress card (web's StreakCard, live path): once
 * today's real count reaches the goal and it has not been celebrated yet, the
 * badge bursts and then flies to the header chip.
 */
export function StreakCard() {
  const streak = useStreakState();
  const markCelebrated = useStreakAnimationStore((s) => s.markCelebrated);
  const beginPending = useStreakAnimationStore((s) => s.beginPending);
  const cancelPending = useStreakAnimationStore((s) => s.cancelPending);
  const triggerFly = useStreakAnimationStore((s) => s.trigger);
  const colors = useColors();
  // Home stays mounted under a practice session (tabs keep their screens), so
  // without this the card would celebrate behind it. A goal reached mid-session
  // is the goal celebrator's to show; it marks the day celebrated, so Home
  // does not replay it on return.
  const focused = useIsFocused();
  const [burst, setBurst] = useState(false);
  const badgeRef = useRef<View>(null);
  const done = useRef(false);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = useSharedValue(1);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // The timers are cleared on unmount only. Clearing them in the effect's
  // cleanup cancelled the flight the moment markCelebrated flipped
  // celebratedToday (one of the effect's own deps), leaving the header chip
  // frozen on yesterday's count.
  useEffect(
    () => () => {
      if (burstTimer.current) clearTimeout(burstTimer.current);
      if (flyTimer.current) clearTimeout(flyTimer.current);
      cancelPending();
    },
    [cancelPending],
  );

  useEffect(() => {
    if (!focused || !streak.loaded || !streak.todayDone || streak.celebratedToday || done.current) return;
    done.current = true;
    // Live data already counts today: the goal being reached is what earned
    // it, and that is the moment this runs.
    const fromStreak = Math.max(streak.currentStreak - 1, 0);
    const newStreak = fromStreak + 1;
    setBurst(true);
    scale.set(withSequence(withTiming(1.1, { duration: 220 }), withTiming(1, { duration: 300 })));
    burstTimer.current = setTimeout(() => setBurst(false), 900);
    // Only with a badge to fly from, as web: otherwise the chip would freeze
    // waiting for a flight that cannot start.
    if (badgeRef.current) beginPending(fromStreak);
    markCelebrated(streak.lastCompletedDate ?? new Date().toISOString().slice(0, 10));
    flyTimer.current = setTimeout(() => {
      flyTimer.current = null;
      const milestone = isMilestoneDay(newStreak) ? newStreak : null;
      if (badgeRef.current) badgeRef.current.measureInWindow((x, y, width, height) => triggerFly({ x, y, width, height }, milestone));
      else cancelPending();
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, streak.loaded, streak.todayDone, streak.celebratedToday]);

  const shown = Math.min(streak.todayProgress, streak.dailyTarget);
  const level = getStreakLevel(streak.currentStreak);
  const accent = useStreakAccent(streak.currentStreak);
  const percent = Math.min(Math.round((shown / streak.dailyTarget) * 100), 100);
  const complete = percent >= 100;
  const idleStyle = useStreakIdlePulse(level.idlePulse);

  return (
    <Card className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Target size={15} color={colors.primary} strokeWidth={2} />
            <Txt weight={700} className="text-sm text-brand-ink">
              Today&apos;s goal
            </Txt>
          </View>
          <Txt font="display" weight={700} className="mt-1 text-2xl leading-8">
            {shown} <Txt className="text-xs text-muted-foreground">/ {streak.dailyTarget} questions</Txt>
          </Txt>
        </View>
        <Animated.View style={[badgeStyle, idleStyle]}>
          <View
            ref={badgeRef}
            collapsable={false}
            className="flex-row items-center gap-1.5 rounded-full border px-2.5 py-1"
            style={{ backgroundColor: withAlpha(accent, 0.16), borderColor: withAlpha(accent, 0.3) }}
          >
            {burst ? <StreakEmbers /> : null}
            <StreakFlame size={16} glow={level.glowIntensity} cold={streak.currentStreak < 1} />
            <Txt weight={600} className="text-xs">
              {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
            </Txt>
          </View>
        </Animated.View>
      </View>
      {/* One pip per question rather than a bar (web): pips can be counted,
          and each one filling is a step taken. Past a couple of dozen they
          would be too thin to read, so the bar comes back. */}
      {streak.dailyTarget <= 24 ? (
        <View className="flex-row gap-1" accessible accessibilityRole="image" accessibilityLabel={`${shown} of ${streak.dailyTarget} questions done today`}>
          {Array.from({ length: streak.dailyTarget }, (_, i) => (
            <View key={i} className={cn("h-2.5 flex-1 rounded-full", i < shown ? "bg-primary" : "bg-accent")} />
          ))}
        </View>
      ) : (
        <ProgressBar value={percent} />
      )}
      {complete ? (
        <View className="gap-1">
          <View className="flex-row items-center gap-1.5">
            <CircleCheck size={16} color={accent} />
            <Txt weight={500} className="text-sm">
              Streak day complete
            </Txt>
          </View>
          <Txt className="pl-[22px] text-sm text-muted-foreground">Come back tomorrow to keep it going.</Txt>
          <View className="flex-row items-center gap-1 pl-[22px]">
            <Trophy size={13} color={colors["muted-foreground"]} />
            <Txt className="text-xs text-muted-foreground">
              Best streak: {streak.bestStreak} day{streak.bestStreak === 1 ? "" : "s"}
            </Txt>
          </View>
        </View>
      ) : (
        <View className="gap-1.5">
          <Txt className="text-[11px] text-muted-foreground">{streak.dailyTarget - shown} more to reach today&apos;s goal.</Txt>
          <View className="flex-row items-center gap-1">
            <Trophy size={13} color={colors["muted-foreground"]} />
            <Txt className="text-xs text-muted-foreground">
              Best streak: {streak.bestStreak} day{streak.bestStreak === 1 ? "" : "s"}
            </Txt>
          </View>
        </View>
      )}
    </Card>
  );
}
