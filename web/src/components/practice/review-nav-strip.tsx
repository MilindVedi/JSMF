"use client";

import { Check, X } from "lucide-react";
import type { Attempt } from "@/types";
import { cn } from "@/lib/utils";

export function ReviewNavStrip({
  questionIds,
  attempts,
  visibleIndices,
  currentIndex,
  onJump,
}: {
  questionIds: string[];
  attempts: Record<string, Attempt>;
  /** Absolute indices into `questionIds` to display — the active filter's
   *  matches, so the strip only ever shows what the filter shows below it. */
  visibleIndices: number[];
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  return (
    // `overflow-x-auto` clips anything outside this box, including the
    // ring-offset ring on the current chip — so it needs padding on every
    // side, not just the bottom, or that ring gets visibly cut off.
    <div className="flex gap-1.5 overflow-x-auto p-1">
      {visibleIndices.map((i) => {
        const id = questionIds[i];
        const attempt = attempts[id];
        const isCurrent = i === currentIndex;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Go to question ${i + 1}`}
            aria-current={isCurrent}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors",
              !attempt && "bg-muted text-muted-foreground",
              attempt?.isCorrect && "bg-success text-success-foreground",
              attempt && !attempt.isCorrect && "bg-error text-error-foreground",
              isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-background"
            )}
          >
            {i + 1}
            {attempt?.isCorrect && <Check className="size-3" strokeWidth={3} />}
            {attempt && !attempt.isCorrect && <X className="size-3" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}
