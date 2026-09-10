import { CheckCircle2, XCircle } from "lucide-react";
import type { Question } from "@/types";
import { FigurePlaceholder } from "@/components/common/figure-placeholder";
import { cn } from "@/lib/utils";

export function ExplanationPanel({
  question,
  isCorrect,
}: {
  question: Question;
  isCorrect: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isCorrect ? "border-success-foreground/20 bg-success/60" : "border-error-foreground/20 bg-error/60"
      )}
    >
      <div
        className={cn(
          "mb-2 flex items-center gap-2 text-sm font-semibold",
          isCorrect ? "text-success-foreground" : "text-error-foreground"
        )}
      >
        {isCorrect ? <CheckCircle2 className="size-4.5" /> : <XCircle className="size-4.5" />}
        {isCorrect ? "Correct" : "Incorrect"}
      </div>
      <p className="prose-reading text-foreground">{question.explanation}</p>
      {question.explanationFigure && <FigurePlaceholder figure={question.explanationFigure} />}
    </div>
  );
}
