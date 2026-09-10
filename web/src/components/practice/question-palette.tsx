"use client";

import { LayoutGrid } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Attempt } from "@/types";
import { cn } from "@/lib/utils";

export function QuestionPalette({
  questionIds,
  attempts,
  flags,
  currentIndex,
  onJump,
}: {
  questionIds: string[];
  attempts: Record<string, Attempt>;
  flags: Record<string, boolean>;
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted"
        aria-label="Question palette"
      >
        <LayoutGrid className="size-4" />
        <span className="hidden sm:inline">Palette</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground">
          <LegendDot className="bg-success" label="Correct" />
          <LegendDot className="bg-error" label="Incorrect" />
          <LegendDot className="bg-muted" label="Unanswered" />
          <LegendDot className="bg-flag" label="Flagged" />
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {questionIds.map((id, i) => {
            const attempt = attempts[id];
            const flagged = Boolean(flags[id]);
            const isCurrent = i === currentIndex;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onJump(i)}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-md text-xs font-semibold transition-colors",
                  !attempt && "bg-muted text-muted-foreground",
                  attempt?.isCorrect && "bg-success text-success-foreground",
                  attempt && !attempt.isCorrect && "bg-error text-error-foreground",
                  isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-popover"
                )}
              >
                {i + 1}
                {flagged && (
                  <span className="absolute -top-1 -right-1 size-2 rounded-full bg-flag-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}
