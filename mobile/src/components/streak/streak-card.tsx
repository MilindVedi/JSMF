import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { CircleCheck, Trophy } from "lucide-react-native";
import { getStreakLevel, isMilestoneDay } from "@jsmf/core/domain";
import { useStreakAnimationStore, useStreakState } from "@/lib/streak";
import { useColors, useStreakAccent, withAlpha } from "@/theme/theme";
import { Card, ProgressBar } from "@/components/ui/primitives";
import { Eyebrow, Txt } from "@/components/ui/text";
import { StreakEmbers } from "./embers";
import { StreakFlame } from "./flame";

/**
 * Home's streak / today's-progress card (web's StreakCard, live path): once
 * today's real count reaches the goal and it has not been celebrated yet, the
 * badge bursts and then flies to the header chip.
 */
export function StreakCard() {
  const streak = useStreakState();
  const markCelebrated = useStreakAnimationStore((s) => s.markCelebrated);
  const beginPending = useStreakAnimationStore((s) => s.beginPending);
  const triggerFly = useStreakAnimationStore((s) => s.trigger);
  const colors = useColors();
  const [burst, setBurst] = useState(false);
  const badgeRef = useRef<View>(null);
  const done = useRef(false);
  const scale = useSharedValue(1);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    if (!streak.loaded || !streak.todayDone || streak.celebratedToday || done.current) return;
    done.current = true;
    // Live data already counts today.
    const fromStreak = Math.max(streak.currentStreak - 1, 0);
    const newStreak = fromStreak + 1;
    setBurst(true);
    scale.value = withSequence(withTiming(1.1, { duration: 220 }), withTiming(1, { duration: 300 }));
    const stopBurst = setTimeout(() => setBurst(false), 900);
    beginPending(fromStreak);
    markCelebrated(streak.lastCompletedDate ?? new Date().toISOString().slice(0, 10));
    const fly = setTimeout(() => {
      const milestone = isMilestoneDay(newStreak) ? newStreak : null;
      if (badgeRef.current) badgeRef.current.measureInWindow((x, y, width, height) => triggerFly({ x, y, width, height }, milestone));
      else triggerFly(null, milestone);
    }, 500);
    return () => {
      clearTimeout(stopBurst);
      clearTimeout(fly);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak.loaded, streak.todayDone, streak.celebratedToday]);

  const shown = Math.min(streak.todayProgress, streak.dailyTarget);
  const level = getStreakLevel(streak.currentStreak);
  const accent = useStreakAccent(streak.currentStreak);
  const percent = Math.min(Math.round((shown / streak.dailyTarget) * 100), 100);
  const complete = percent >= 100;

  return (
    <Card className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Eyebrow>Today&apos;s streak progress</Eyebrow>
          <Txt font="display" weight={600} className="mt-1 text-2xl">
            {shown} <Txt className="text-base text-muted-foreground">/ {streak.dailyTarget} questions</Txt>
          </Txt>
        </View>
        <Animated.View style={badgeStyle}>
          <View
            ref={badgeRef}
            collapsable={false}
            className="flex-row items-center gap-1.5 rounded-full border px-2.5 py-1"
            style={{ backgroundColor: withAlpha(accent, 0.16), borderColor: withAlpha(accent, 0.3) }}
          >
            {burst ? <StreakEmbers /> : null}
            <StreakFlame size={16} glow={level.glowIntensity} />
            <Txt weight={600} className="text-xs" style={{ color: accent }}>
              {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
            </Txt>
          </View>
        </Animated.View>
      </View>
      <ProgressBar value={percent} />
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
              Best: {streak.bestStreak} day{streak.bestStreak === 1 ? "" : "s"}
            </Txt>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center justify-between gap-3">
          <Txt className="flex-1 text-sm text-muted-foreground">{streak.dailyTarget - shown} more to reach today&apos;s goal.</Txt>
          <View className="flex-row items-center gap-1">
            <Trophy size={13} color={colors["muted-foreground"]} />
            <Txt className="text-xs text-muted-foreground">Best: {streak.bestStreak}d</Txt>
          </View>
        </View>
      )}
    </Card>
  );
}
