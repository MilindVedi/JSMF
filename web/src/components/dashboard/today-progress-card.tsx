"use client";

import { Flame } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { countAttemptsOnDay } from "@/lib/selectors";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import type { TestSession } from "@/types";

const DAILY_GOAL = 10;

export function TodayProgressCard({
  sessions,
  streakDays,
}: {
  sessions: TestSession[];
  streakDays: number;
}) {
  // The clock is a client-only value, so it can't be read during render.
  const dayISO = useClientSnapshot<string | null>(
    () => new Date().toISOString().slice(0, 10),
    null
  );

  const answeredToday = dayISO ? countAttemptsOnDay(sessions, dayISO) : 0;
  const remaining = Math.max(DAILY_GOAL - answeredToday, 0);
  const percent = Math.min(Math.round((answeredToday / DAILY_GOAL) * 100), 100);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Today&apos;s progress
          </p>
          <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
            {answeredToday}{" "}
            <span className="text-base font-medium text-muted-foreground">
              / {DAILY_GOAL} questions
            </span>
          </p>
        </div>
        {streakDays > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-accent/20 px-2.5 py-1">
            <Flame className="size-3.5 text-accent-foreground" strokeWidth={2} />
            <span className="text-xs font-semibold text-accent-foreground">
              {streakDays} day{streakDays === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      <Progress value={percent} className="mt-4" aria-label="Progress toward today's goal" />

      <p className="mt-3 text-sm text-muted-foreground">
        {answeredToday === 0
          ? streakDays > 0
            ? `A short session keeps your ${streakDays}-day streak going.`
            : "Answer a few questions to start a streak."
          : remaining > 0
            ? `${remaining} more to reach today's goal.`
            : "Today's goal reached — nice work."}
      </p>
    </div>
  );
}
