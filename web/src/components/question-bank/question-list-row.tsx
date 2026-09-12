"use client";

import { Check, ChevronRight, Circle, X } from "lucide-react";
import type { Question } from "@/types";
import { SubjectBadge } from "@/components/common/subject-badge";
import { ExamBadge } from "@/components/common/exam-badge";
import { BookmarkButton } from "@/components/practice/bookmark-button";
import { AddToCollectionButton } from "./add-to-collection-button";
import { useBookmarksStore } from "@/store/bookmarks-store";
import type { QuestionStatus } from "@/lib/selectors";

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
  number,
  onClick,
}: {
  question: Question;
  status?: QuestionStatus;
  /** The question's position in the current (filtered) list — shown as a
   *  subtle "Q{n}" so a specific question is easy to reference. */
  number?: number;
  onClick: () => void;
}) {
  const isBookmarked = useBookmarksStore((s) => s.isBookmarked(question.id));
  const toggleBookmark = useBookmarksStore((s) => s.toggleBookmark);

  return (
    <div className="flex w-full items-start gap-1 px-2 py-2 transition-colors hover:bg-muted/50 sm:px-4 sm:py-3.5">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start gap-3 py-1.5 pl-2 text-left"
      >
        <div className="mt-0.5 shrink-0">
          <StatusDot status={status} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {number != null && (
              <span className="text-xs font-semibold text-foreground">Q{number}</span>
            )}
            <ExamBadge examId={question.examId} />
            <SubjectBadge subjectId={question.subjectId} />
            <span className="text-xs text-muted-foreground">{question.year}</span>
          </div>
          <p className="line-clamp-2 text-sm text-foreground">{question.stem}</p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-0.5 pt-1">
        <BookmarkButton
          isBookmarked={isBookmarked}
          onToggle={() => toggleBookmark(question.id)}
        />
        <AddToCollectionButton questionId={question.id} />
        <span className="flex size-8 items-center justify-center text-muted-foreground">
          <ChevronRight className="size-4" />
        </span>
      </div>
    </div>
  );
}
