"use client";

import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Attempt } from "@jsmf/core/domain";
import { cn } from "@/lib/utils";

interface PaletteProps {
  questionIds: string[];
  attempts: Record<string, Attempt>;
  flags: Record<string, boolean>;
  currentIndex: number;
  onJump: (index: number) => void;
  /** Test mode before submit: answered, but not whether correctly. */
  hideResults?: boolean;
}

/**
 * The practice palette, where the real exam console keeps it: a panel down
 * the right-hand side on wide screens, and a right-side drawer below that.
 * Both scroll on their own, so a 187-question session never runs off the
 * page. The legend stays pinned above the grid.
 */
export function QuestionPalettePanel(props: PaletteProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <PaletteLegend hideResults={props.hideResults} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Questions · {props.questionIds.length}
        </p>
        <PaletteGrid {...props} />
      </div>
    </div>
  );
}

/** The bottom bar's Palette button, below `lg`, where the side panel does not fit. */
export function QuestionPalette(props: PaletteProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted lg:hidden"
        aria-label="Question palette"
      >
        <LayoutGrid className="size-4" />
        <span className="hidden sm:inline">Palette</span>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] gap-0 p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Questions</SheetTitle>
          <SheetDescription className="sr-only">Every question in this session; tap one to open it.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <QuestionPalettePanel
            {...props}
            onJump={(i) => {
              setOpen(false);
              props.onJump(i);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PaletteLegend({ hideResults }: { hideResults?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      {hideResults ? (
        <LegendDot className="bg-primary" label="Answered" />
      ) : (
        <>
          <LegendDot className="bg-success" label="Correct" />
          <LegendDot className="bg-error" label="Incorrect" />
        </>
      )}
      <LegendDot className="bg-muted" label="Unanswered" />
      <LegendDot className="bg-flag" label="Flagged" />
    </div>
  );
}

function PaletteGrid({ questionIds, attempts, flags, currentIndex, onJump, hideResults = false }: PaletteProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {questionIds.map((id, i) => {
        const attempt = attempts[id];
        const flagged = Boolean(flags[id]);
        const isCurrent = i === currentIndex;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Question ${i + 1}`}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "relative flex size-9 items-center justify-center justify-self-center rounded-md text-xs font-semibold tabular-nums transition-colors",
              !attempt && "bg-muted text-muted-foreground hover:bg-muted/70",
              attempt && hideResults && "bg-primary text-primary-foreground",
              attempt && !hideResults && attempt.isCorrect && "bg-success text-success-foreground",
              attempt && !hideResults && !attempt.isCorrect && "bg-error text-error-foreground",
              isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-card"
            )}
          >
            {i + 1}
            {flagged && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-flag-foreground" />}
          </button>
        );
      })}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}
