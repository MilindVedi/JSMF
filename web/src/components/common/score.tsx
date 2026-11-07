import { SCORE_BANDS, scoreBand, scoreBandLabel, type ScoreBand } from "@jsmf/core/domain";
import { cn } from "@/lib/utils";

/**
 * Scores are coloured by band, never the brand violet (core's scoreBand, the
 * same as the app): red under 40 · amber under 70 · green under 85 · deep
 * teal from 85. Plain progress — how much is done — stays violet.
 * Full class names, so Tailwind finds them.
 */
const BAND: Record<ScoreBand, { bar: string; pill: string; ink: string; dot: string; cssVar: string }> = {
  "needs-improvement": { bar: "bg-band-low", pill: "bg-band-low-soft text-band-low-ink", ink: "text-band-low-ink", dot: "bg-band-low", cssVar: "var(--color-band-low)" },
  developing: { bar: "bg-band-mid", pill: "bg-band-mid-soft text-band-mid-ink", ink: "text-band-mid-ink", dot: "bg-band-mid", cssVar: "var(--color-band-mid)" },
  good: { bar: "bg-band-good", pill: "bg-band-good-soft text-band-good-ink", ink: "text-band-good-ink", dot: "bg-band-good", cssVar: "var(--color-band-good)" },
  excellent: { bar: "bg-band-top", pill: "bg-band-top-soft text-band-top-ink", ink: "text-band-top-ink", dot: "bg-band-top", cssVar: "var(--color-band-top)" },
};

export function scoreClasses(accuracy: number) {
  return BAND[scoreBand(accuracy)];
}

/** A score's band colour as a CSS value, for charts (recharts fills). */
export function scoreColor(accuracy: number): string {
  return BAND[scoreBand(accuracy)].cssVar;
}

/** A score as a bar in its band's colour (a dot of colour even at 0%, so "none right" still reads red). */
export function ScoreBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={`${label ? `${label}: ` : ""}${pct}% accuracy, ${scoreBandLabel(pct)}`}
    >
      <div className={cn("h-full min-w-1.5 rounded-full transition-[width] duration-500", scoreClasses(pct).bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A score as a small pill ("33%") in its band's colours. */
export function ScorePill({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", scoreClasses(value).pill, className)} title={scoreBandLabel(value)}>
      {value}%
    </span>
  );
}

/** What the score colours mean, for under a list of score bars. */
export function BandLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {SCORE_BANDS.map((b) => (
        <span key={b.band} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-2 rounded-full", BAND[b.band].dot)} />
          {b.label}
        </span>
      ))}
    </div>
  );
}
