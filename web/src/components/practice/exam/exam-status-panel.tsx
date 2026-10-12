"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EXAM_STATUS_LABEL,
  EXAM_STATUS_ORDER,
  type ExamQuestionStatus,
  type ExamStatusCounts,
} from "@jsmf/core/domain";

/**
 * One shape per status, shared by the legend and the grid so they always
 * match: squares for plain states, a circle for anything marked for review.
 */
const CELL_CLASS: Record<ExamQuestionStatus, string> = {
  answered: "rounded-[0.3rem] border-success-foreground/25 bg-success text-success-foreground",
  "not-answered": "rounded-[0.3rem] border-error-foreground/25 bg-error text-error-foreground",
  "not-visited": "rounded-[0.3rem] border-border bg-card text-muted-foreground",
  marked: "rounded-full border-transparent bg-primary text-primary-foreground",
  "answered-marked": "rounded-full border-transparent bg-primary text-primary-foreground",
};

export function ExamStatusCell({
  status,
  children,
  className,
}: {
  status: ExamQuestionStatus;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center border text-xs font-semibold tabular-nums",
        CELL_CLASS[status],
        className
      )}
    >
      {children}
      {status === "answered-marked" && (
        <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-success-foreground text-background ring-2 ring-card">
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}

export function ExamStatusLegend({ counts }: { counts: ExamStatusCounts }) {
  return (
    <div className="space-y-2.5">
      <ul className="grid grid-cols-1 gap-2">
        {EXAM_STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-center gap-2.5 text-xs text-foreground">
            <ExamStatusCell status={status} className="size-7">
              {counts[status]}
            </ExamStatusCell>
            <span className="leading-tight">{EXAM_STATUS_LABEL[status]}</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.7rem] leading-snug text-muted-foreground">
        Answered &amp; Marked for Review questions are evaluated as answered.
      </p>
    </div>
  );
}

export function ExamQuestionGrid({
  statuses,
  currentIndex,
  onJump,
}: {
  statuses: ExamQuestionStatus[];
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {statuses.map((status, i) => {
        const isCurrent = i === currentIndex;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Question ${i + 1}, ${EXAM_STATUS_LABEL[status]}`}
            aria-current={isCurrent ? "step" : undefined}
            className="flex justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExamStatusCell
              status={status}
              className={cn(
                "size-9 transition-transform hover:scale-105",
                isCurrent && "ring-2 ring-foreground ring-offset-2 ring-offset-card"
              )}
            >
              {i + 1}
            </ExamStatusCell>
          </button>
        );
      })}
    </div>
  );
}

/** Legend with live counts above the jump grid; the desktop sidebar and the mobile sheet both render this. */
export function ExamStatusPanel({
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
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <ExamStatusLegend counts={counts} />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Questions</p>
        <ExamQuestionGrid statuses={statuses} currentIndex={currentIndex} onJump={onJump} />
      </div>
    </div>
  );
}
