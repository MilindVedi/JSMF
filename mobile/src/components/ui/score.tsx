import { Platform, View } from "react-native";
import { SCORE_BANDS, scoreBand, scoreBandLabel, type ScoreBand } from "@jsmf/core/domain";
import { AnimatedView } from "@/components/motion/animated";
import { useColors, withAlpha } from "@/theme/theme";
import { useGrowingWidth } from "./primitives";
import { cn, Txt } from "./text";

/**
 * Scores are coloured by band, never the brand purple (core's scoreBand):
 * red under 40 · amber under 70 · green under 85 · deep teal from 85.
 * Plain progress — how much is done — stays a purple ProgressBar.
 */
const TOKEN: Record<ScoreBand, "band-low" | "band-mid" | "band-good" | "band-top"> = {
  "needs-improvement": "band-low",
  developing: "band-mid",
  good: "band-good",
  excellent: "band-top",
};

/** The colours of a score's band: `solid` for bars and rings, `soft` + `ink` for pills. */
export function useBandColors(accuracy: number) {
  const colors = useColors();
  const token = TOKEN[scoreBand(accuracy)];
  return { solid: colors[token], soft: colors[`${token}-soft`], ink: colors[`${token}-ink`] };
}

/** A score as a bar in its band's colour, lighter at the start (the design's bars). */
export function ScoreBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const { solid } = useBandColors(pct);
  const fill = useGrowingWidth(pct);
  return (
    <View
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
      accessibilityRole="progressbar"
      accessibilityLabel={scoreBandLabel(pct)}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      {/* A dot's worth of colour even at 0%, so "none right" still reads as red, not as missing. */}
      <AnimatedView
        className="h-full min-w-2 rounded-full"
        style={[
          { backgroundColor: solid },
          // The native style engine draws the soft start; web keeps the solid colour.
          Platform.OS === "web" ? null : { experimental_backgroundImage: `linear-gradient(90deg, ${withAlpha(solid, 0.55)}, ${solid})` },
        ]}
        animatedStyle={fill}
      />
    </View>
  );
}

/** A score as a small pill ("33%") in its band's colours. */
export function ScorePill({ value, className }: { value: number; className?: string }) {
  const { soft, ink } = useBandColors(value);
  return (
    <View className={cn("self-center rounded-full px-2.5 py-1", className)} style={{ backgroundColor: soft }} accessibilityLabel={`${value}%, ${scoreBandLabel(value)}`}>
      <Txt weight={700} className="text-xs" style={{ color: ink }}>
        {value}%
      </Txt>
    </View>
  );
}

/** What the score colours mean, for under a list of score bars. */
export function BandLegend({ className }: { className?: string }) {
  const colors = useColors();
  return (
    <View className={cn("flex-row flex-wrap gap-x-3 gap-y-1.5", className)}>
      {SCORE_BANDS.map((b) => (
        <View key={b.band} className="flex-row items-center gap-1.5">
          <View className="size-2 rounded-full" style={{ backgroundColor: colors[TOKEN[b.band]] }} />
          <Txt className="text-[11px] text-muted-foreground">{b.label}</Txt>
        </View>
      ))}
    </View>
  );
}
