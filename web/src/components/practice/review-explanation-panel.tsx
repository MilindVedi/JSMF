import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { Question } from "@/types";
import { FigurePlaceholder } from "@/components/common/figure-placeholder";
import { cn } from "@/lib/utils";

/**
 * Like ExplanationPanel, but for the review screen where a question can also
 * be "unattempted" — a third state ExplanationPanel's boolean isCorrect can't
 * represent. Kept separate so the live practice flow's contract is untouched.
 */
export function ReviewExplanationPanel({
  question,
  status,
}: {
  question: Question;
  status: "correct" | "incorrect" | "unattempted";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        status === "correct" && "border-success-foreground/20 bg-success/60",
        status === "incorrect" && "border-error-foreground/20 bg-error/60",
        status === "unattempted" && "border-border bg-muted/50"
      )}
    >
      <div
        className={cn(
          "mb-2 flex items-center gap-2 text-sm font-semibold",
          status === "correct" && "text-success-foreground",
          status === "incorrect" && "text-error-foreground",
          status === "unattempted" && "text-muted-foreground"
        )}
      >
        {status === "correct" && <CheckCircle2 className="size-4.5" />}
        {status === "incorrect" && <XCircle className="size-4.5" />}
        {status === "unattempted" && <Circle className="size-4.5" />}
        {status === "correct" ? "Correct" : status === "incorrect" ? "Incorrect" : "Not attempted"}
      </div>
      <p className="prose-reading text-foreground">{question.explanation}</p>
      {question.explanationFigure && <FigurePlaceholder figure={question.explanationFigure} />}
    </div>
  );
}
