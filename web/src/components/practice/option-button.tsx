"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function OptionButton({
  index,
  text,
  submitted,
  isSelected,
  isCorrectOption,
  onSelect,
}: {
  index: number;
  text: string;
  submitted: boolean;
  isSelected: boolean;
  isCorrectOption: boolean;
  onSelect: () => void;
}) {
  const showAsCorrect = submitted && isCorrectOption;
  const showAsWrongSelection = submitted && isSelected && !isCorrectOption;
  const muted = submitted && !isSelected && !isCorrectOption;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      disabled={submitted}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        "disabled:cursor-default",
        !submitted && !isSelected && "border-border hover:border-foreground/30 hover:bg-muted/40",
        !submitted && isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
        showAsCorrect && "border-success-foreground/30 bg-success",
        showAsWrongSelection && "border-error-foreground/30 bg-error",
        muted && "border-border opacity-60"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          !submitted && !isSelected && "border-border text-muted-foreground",
          !submitted && isSelected && "border-primary bg-primary text-primary-foreground",
          showAsCorrect && "border-transparent bg-success-foreground text-success",
          showAsWrongSelection && "border-transparent bg-error-foreground text-error",
          muted && "border-border text-muted-foreground"
        )}
      >
        {showAsCorrect ? <Check className="size-3.5" strokeWidth={3} /> : showAsWrongSelection ? <X className="size-3.5" strokeWidth={3} /> : LETTERS[index]}
      </span>
      <span
        className={cn(
          "prose-reading pt-0.5 text-foreground",
          showAsCorrect && "text-success-foreground",
          showAsWrongSelection && "text-error-foreground"
        )}
      >
        {text}
      </span>
    </button>
  );
}
