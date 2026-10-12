"use client";

import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EXAM_STATUS_LABEL, EXAM_STATUS_ORDER, type ExamQuestionStatus, type ExamStatusCounts } from "@jsmf/core/domain";
import { ExamStatusCell, ExamStatusPanel } from "./exam-status-panel";

/**
 * Below `lg` the status panel does not fit beside the question: a slim strip
 * of counts under the header, and the full legend + grid in a side sheet.
 */
export function ExamMobileStatusBar({
  counts,
  statuses,
  currentIndex,
  onJump,
}: {
  counts: ExamStatusCounts;
  statuses: ExamQuestionStatus[];
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-14 z-20 flex h-11 items-center gap-3 border-b border-border bg-background px-3 lg:hidden">
      <ul className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden" aria-label="Question status counts">
        {EXAM_STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-center" title={EXAM_STATUS_LABEL[status]}>
            <ExamStatusCell status={status} className="size-6 text-[0.65rem]">
              {counts[status]}
            </ExamStatusCell>
            <span className="sr-only">{EXAM_STATUS_LABEL[status]}</span>
          </li>
        ))}
      </ul>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted">
          <LayoutGrid className="size-4" />
          All questions
        </SheetTrigger>
        <SheetContent side="right" className="w-[300px] gap-0 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Question status</SheetTitle>
            <SheetDescription className="sr-only">Status of every question; tap one to open it.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <ExamStatusPanel
              counts={counts}
              statuses={statuses}
              currentIndex={currentIndex}
              onJump={(i) => {
                setOpen(false);
                onJump(i);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
