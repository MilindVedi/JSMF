"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ExamActionBar({
  isFirst,
  isLast,
  busy,
  canClear,
  clearHint,
  onPrev,
  onSaveNext,
  onMarkNext,
  onClear,
  submitSlot,
}: {
  isFirst: boolean;
  isLast: boolean;
  /** An answer or flag write is in flight. */
  busy: boolean;
  canClear: boolean;
  /** Why Clear Response is off, when it is off for a reason worth saying. */
  clearHint?: string;
  onPrev: () => void;
  onSaveNext: () => void;
  onMarkNext: () => void;
  onClear: () => void;
  submitSlot: ReactNode;
}) {
  const clearButton = (
    <Button variant="outline" size="lg" className="w-full sm:w-auto" onClick={onClear} disabled={!canClear || busy}>
      <Eraser />
      Clear Response
    </Button>
  );

  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/85 sm:px-5">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-2 sm:flex-row sm:items-center">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button
            variant="outline"
            size="lg"
            onClick={onMarkNext}
            disabled={busy}
            aria-label={isLast ? "Mark for Review" : "Mark for Review & Next"}
          >
            <Bookmark />
            {/* The full label does not fit half a phone row. */}
            <span className="sm:hidden">{isLast ? "Mark" : "Mark & Next"}</span>
            <span className="hidden sm:inline">{isLast ? "Mark for Review" : "Mark for Review & Next"}</span>
          </Button>
          {!canClear && clearHint ? (
            <Tooltip>
              <TooltipTrigger render={<span className="block" />}>{clearButton}</TooltipTrigger>
              <TooltipContent>{clearHint}</TooltipContent>
            </Tooltip>
          ) : (
            clearButton
          )}
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <Button variant="outline" size="lg" onClick={onPrev} disabled={isFirst || busy} aria-label="Previous">
            <ArrowLeft />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <Button size="lg" className="flex-1 sm:flex-none" onClick={onSaveNext} disabled={busy}>
            {isLast ? "Save" : "Save & Next"}
            {!isLast && <ArrowRight />}
          </Button>
          {submitSlot}
        </div>
      </div>
    </div>
  );
}
