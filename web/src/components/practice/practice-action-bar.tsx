"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FlagTriangleRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PracticeActionBar({
  submitted,
  hasSelection,
  isFirst,
  isLast,
  onPrev,
  onNext,
  onSubmit,
  onFinish,
  paletteSlot,
  reportSlot,
}: {
  submitted: boolean;
  hasSelection: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onFinish: () => void;
  paletteSlot: ReactNode;
  reportSlot: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/85 sm:px-5">
      <div className="mx-auto flex w-full max-w-[760px] items-center gap-2">
        <Button variant="outline" size="lg" onClick={onPrev} disabled={isFirst}>
          <ArrowLeft />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        <div className="flex items-center gap-2">{paletteSlot}{reportSlot}</div>

        <div className="ml-auto flex items-center gap-2">
          {!submitted ? (
            <Button size="lg" onClick={onSubmit} disabled={!hasSelection}>
              <CheckCircle2 />
              Submit
            </Button>
          ) : isLast ? (
            <Button size="lg" onClick={onFinish}>
              <FlagTriangleRight />
              Finish test
            </Button>
          ) : (
            <Button size="lg" onClick={onNext}>
              <span className="hidden sm:inline">Next</span>
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
