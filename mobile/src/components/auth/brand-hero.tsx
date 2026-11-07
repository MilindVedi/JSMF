import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sparkles } from "lucide-react-native";
import { useTaxonomy } from "@jsmf/core/hooks";
import { swing, useLoopClock } from "@/components/motion/loop";
import { Rise as BaseRise } from "@/components/motion/rise";
import { LinearGradientFill, RadialGlow } from "@/components/ui/gradient";
import { LOGO } from "@/components/ui/screen";
import { Txt } from "@/components/ui/text";
import palette from "@/theme/palette.json";
import { withAlpha } from "@/theme/theme";

/**
 * The hero's colours, the same in both schemes. In dark mode `primary` is a
 * pale lavender that the hero's white text can't sit on, so the gradient keeps
 * light mode's violet.
 */
export const HERO = {
  deep: palette.light["brand-deep"],
  vivid: palette.light.primary,
  onDeep: palette.light["brand-on-deep"],
};

/**
 * A part of the sign-in screen that rises in when it opens (the shared Rise,
 * slower and from further down than in the app, as the design has it).
 */
export function Rise(props: { delayMs: number; className?: string; children: ReactNode }) {
  return <BaseRise durationMs={700} distance={18} {...props} />;
}

/** What the app covers, shown while the bank's own list loads (or if it is empty). */
const PRODUCT_EXAMS = ["NEET-PG", "FMGE", "INI-CET"];

/**
 * "180+", "10,000+": the bank's size rounded down to two significant figures,
 * so the claim is never more than the truth. Null below 100 questions, where a
 * number says the bank is new rather than that it is deep.
 */
export function questionCountLabel(total: number): string | null {
  if (total < 100) return null;
  const step = 10 ** (Math.floor(Math.log10(total)) - 1);
  const rounded = Math.floor(total / step) * step;
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}+`;
}

/**
 * The top of the sign-in screen: a violet gradient with three slowly drifting
 * glows, the mark and name, a greeting, the bank's size
 * and the exams covered. Its bottom 48px sit under the form card.
 */
export function BrandHero() {
  const insets = useSafeAreaInsets();
  const taxonomy = useTaxonomy();
  const exams = taxonomy.data?.exams.length ? taxonomy.data.exams.map((exam) => exam.shortName) : PRODUCT_EXAMS;
  const total = taxonomy.data?.subjects.reduce((sum, subject) => sum + subject.questionCount, 0) ?? 0;
  const count = questionCountLabel(total);

  return (
    <View className="overflow-hidden rounded-b-[32px] px-[22px] pb-[70px]" style={{ paddingTop: insets.top + 20 }}>
      <LinearGradientFill
        layers={[
          { angle: 150, stops: [{ offset: 0, color: HERO.deep }, { offset: 1, color: HERO.vivid }] },
          {
            angle: 125,
            stops: [
              { offset: 0, color: HERO.onDeep, opacity: 0.22 },
              { offset: 0.45, color: HERO.onDeep, opacity: 0 },
            ],
          },
        ]}
      />
      <Orbs />

      <Rise delayMs={0} className="flex-row items-center gap-2.5">
        <View
          className="rounded-full p-[3px]"
          style={{ backgroundColor: withAlpha(HERO.onDeep, 0.25), boxShadow: "0 8px 20px -6px rgba(0, 0, 0, 0.4)" }}
        >
          <Image source={LOGO} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" accessibilityIgnoresInvertColors />
        </View>
        <View>
          <Txt font="display" weight={700} className="text-lg leading-6" style={{ color: HERO.onDeep }}>
            JSMF{" "}
            <Txt font="display" weight={600} className="text-lg leading-6" style={{ color: HERO.onDeep, opacity: 0.75 }}>
              PYQs
            </Txt>
          </Txt>
          {/* What the initials stand for, as every JSMF site shows it, trailed by a rule. */}
          <View className="flex-row items-center gap-2">
            <Txt weight={700} className="text-[10px] uppercase tracking-[1.5px]" style={{ color: HERO.onDeep, opacity: 0.8 }}>
              Jab Studies Met Fun
            </Txt>
            <View className="h-px w-6" style={{ backgroundColor: withAlpha(HERO.onDeep, 0.5) }} />
          </View>
        </View>
      </Rise>

      <Rise delayMs={90} className="mt-8">
        <HeroPill>
          <Sparkles size={13} color={HERO.onDeep} />
          <Txt weight={600} className="text-[11px]" style={{ color: HERO.onDeep }}>
            {count ? `${count} memory-based PYQs` : "Memory-based PYQs"}
          </Txt>
        </HeroPill>
        <View className="mt-4" accessible accessibilityRole="header" accessibilityLabel="Hello, Doc Sahab">
          <Txt font="display" weight={700} className="text-[28px] leading-[34px]" style={{ color: HERO.onDeep }}>
            Hello,
          </Txt>
          <View className="flex-row items-center">
            <Txt font="display" weight={700} className="text-[28px] leading-[34px]" style={{ color: HERO.onDeep }}>
              Doc Sahab
            </Txt>
            <WavingHand />
          </View>
        </View>
        <Txt className="mt-2 text-sm" style={{ color: HERO.onDeep, opacity: 0.8 }}>
          Practise the questions that actually show up, and revise what you miss.
        </Txt>
      </Rise>

      <Rise delayMs={160} className="mt-5 flex-row flex-wrap gap-2">
        {exams.map((exam) => (
          <View
            key={exam}
            className="rounded-[10px] border px-3 py-1.5"
            style={{ backgroundColor: withAlpha(HERO.onDeep, 0.12), borderColor: withAlpha(HERO.onDeep, 0.22) }}
          >
            <Txt weight={700} className="text-[11px]" style={{ color: HERO.onDeep }}>
              {exam}
            </Txt>
          </View>
        ))}
      </Rise>
    </View>
  );
}

function HeroPill({ children }: { children: ReactNode }) {
  return (
    <View
      className="flex-row items-center gap-1.5 self-start rounded-full border px-[11px] py-[5px]"
      style={{ backgroundColor: withAlpha(HERO.onDeep, 0.16), borderColor: withAlpha(HERO.onDeep, 0.28) }}
    >
      {children}
    </View>
  );
}

const ORBS = [
  { size: 220, position: { top: -80, right: -70 }, phase: 0 },
  { size: 140, position: { bottom: -40, left: -40 }, phase: 3 / 9 },
  { size: 70, position: { top: 110, right: 40 }, phase: 6 / 9 },
] as const;

/** Three soft glows drifting on one 9s clock, each a third of a turn apart. */
function Orbs() {
  const clock = useLoopClock(9000);
  return (
    <>
      {ORBS.map((orb) => (
        <Orb key={orb.phase} clock={clock} {...orb} />
      ))}
    </>
  );
}

function Orb({
  clock,
  size,
  position,
  phase,
}: {
  clock: ReturnType<typeof useLoopClock>;
  size: number;
  position: (typeof ORBS)[number]["position"];
  phase: number;
}) {
  const style = useAnimatedStyle(() => {
    const drift = swing(clock.value, phase);
    return { transform: [{ translateX: -14 * drift }, { translateY: 16 * drift }, { scale: 1 + 0.08 * drift }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, overflow: "hidden" }, position, style]}
    >
      <RadialGlow color={HERO.onDeep} opacity={0.45} />
    </Animated.View>
  );
}

/** 👋 waving twice, then resting, every 2.4s. Decorative: hidden from screen readers. */
function WavingHand() {
  const clock = useLoopClock(2400);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(clock.value, [0, 0.1, 0.2, 0.3, 0.4, 0.6, 1], [0, 16, -8, 16, -8, 0, 0])}deg` }],
  }));
  return (
    <Animated.View style={[{ marginLeft: 6, transformOrigin: "70% 70%" }, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text style={{ fontSize: 26, lineHeight: 34 }}>👋</Text>
    </Animated.View>
  );
}
