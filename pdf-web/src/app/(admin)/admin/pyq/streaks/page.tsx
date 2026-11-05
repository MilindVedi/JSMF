import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The streak stages the PYQ app (prep.jsmf.me) shows, for reference: which
 * colour a student's streak box takes at each length. Read-only — the stages
 * are defined in packages/core/src/domain/streak.ts (STREAK_LEVELS) and the colours
 * in web/src/app/globals.css (--streak-*). Apps never import each other's
 * code, so keep this list in step with those two when they change.
 */
const STAGES = [
  { label: "Getting started", from: 0, color: "oklch(0.5 0.035 292)" },
  { label: "Spark", from: 1, color: "oklch(0.82 0.14 85)" },
  { label: "Warming up", from: 3, color: "oklch(0.72 0.18 50)" },
  { label: "On a roll", from: 7, color: "oklch(0.65 0.22 25)" },
  { label: "Blazing", from: 14, color: "oklch(0.58 0.24 300)" },
  { label: "Legendary", from: 30, color: "oklch(0.8 0.16 90)" },
  { label: "Elite", from: 45, color: "oklch(0.62 0.16 60)" },
  { label: "Master", from: 60, color: "oklch(0.58 0.15 45)" },
  { label: "Grandmaster", from: 90, color: "oklch(0.54 0.14 32)" },
  { label: "Mythic", from: 120, color: "oklch(0.5 0.13 20)" },
];

export default function StreakStagesPage() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Streak stages</CardTitle>
        <CardDescription>
          The colour of a student&apos;s streak box at each streak length; the flame itself is always fire-coloured.
          A day counts towards the streak once the student reaches their daily goal (10 questions unless they
          change it) — the same moment that plays the celebration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {STAGES.map((stage, i) => {
            const next = STAGES[i + 1];
            const range = next ? `${stage.from}–${next.from - 1} days` : `${stage.from}+ days`;
            return (
              <li key={stage.label} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span
                  className="inline-flex h-6 min-w-16 items-center justify-center rounded-full border px-2 text-xs font-semibold text-foreground"
                  style={{
                    backgroundColor: `color-mix(in oklch, ${stage.color} 18%, transparent)`,
                    borderColor: `color-mix(in oklch, ${stage.color} 45%, transparent)`,
                  }}
                >
                  {stage.from}d
                </span>
                <span className="flex-1 font-medium">{stage.label}</span>
                <span className="text-muted-foreground">{range}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
