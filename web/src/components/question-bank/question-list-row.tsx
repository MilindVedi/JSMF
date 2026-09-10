"use client";

import { Bookmark, Check, ChevronRight, Circle, X } from "lucide-react";
import type { Question } from "@/types";
import { SubjectBadge } from "@/components/common/subject-badge";
import { ExamBadge } from "@/components/common/exam-badge";
import { useBookmarksStore } from "@/store/bookmarks-store";
import type { QuestionStatus } from "@/lib/selectors";
import { cn } from "@/lib/utils";

function StatusDot({ status }: { status: QuestionStatus }) {
  if (status === "correct") {
    return (
      <span
        title="Answered correctly"
        className="flex size-5 items-center justify-center rounded-full bg-success text-success-foreground"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "incorrect") {
    return (
      <span
        title="Answered incorrectly"
        className="flex size-5 items-center justify-center rounded-full bg-error text-error-foreground"
      >
        <X className="size-3" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span title="Not attempted yet" className="flex size-5 items-center justify-center">
      <Circle className="size-3 text-muted-foreground/40" strokeWidth={2.5} />
    </span>
  );
}

export function QuestionListRow({
  question,
  status = "unattempted",
  onClick,
}: {
  question: Question;
  status?: QuestionStatus;
  onClick: () => void;
}) {
  const isBookmarked = useBookmarksStore((s) => s.isBookmarked(question.id));

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
    >
      <div className="mt-0.5 shrink-0">
        <StatusDot status={status} />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <ExamBadge examId={question.examId} />
          <SubjectBadge subjectId={question.subjectId} />
          <span className="text-xs text-muted-foreground">{question.year}</span>
        </div>
        <p className="line-clamp-2 text-sm text-foreground">{question.stem}</p>
      </div>
      <Bookmark
        className={cn(
          "mt-1 size-4 shrink-0 text-muted-foreground",
          isBookmarked && "fill-accent-foreground text-accent-foreground"
        )}
      />
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
