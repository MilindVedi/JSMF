"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { QUESTIONS } from "@/data/mock/questions";
import { cn } from "@/lib/utils";

const OPTION_LETTERS = ["A", "B", "C", "D"];

export function QuestionPreviewDemo() {
  const question = useMemo(
    () => QUESTIONS.find((q) => q.subjectId === "general-medicine") ?? QUESTIONS[0],
    []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hasAnswered = selectedId !== null;

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Try a real question
          </h2>
          <p className="mt-3 text-muted-foreground">
            This is an actual question from the JSMF question bank. Pick an option to see how it
            works.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">{question.examId.toUpperCase()}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">{question.year}</span>
            <span className="rounded-full bg-muted px-2.5 py-1 capitalize">{question.difficulty}</span>
          </div>

          <p className="prose-reading text-foreground">{question.stem}</p>

          <div className="mt-6 flex flex-col gap-2.5">
            {question.options.map((option, i) => {
              const isCorrect = option.id === question.correctOptionId;
              const isSelected = option.id === selectedId;

              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={hasAnswered}
                  onClick={() => setSelectedId(option.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                    !hasAnswered &&
                      "border-border bg-background hover:border-primary/40 hover:bg-muted",
                    hasAnswered && isCorrect && "border-success bg-success text-success-foreground",
                    hasAnswered &&
                      isSelected &&
                      !isCorrect &&
                      "border-error bg-error text-error-foreground",
                    hasAnswered &&
                      !isSelected &&
                      !isCorrect &&
                      "border-border bg-background opacity-60"
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                    {OPTION_LETTERS[i]}
                  </span>
                  <span className="flex-1">{option.text}</span>
                  {hasAnswered && isCorrect && <CheckCircle2 className="size-5 shrink-0" />}
                  {hasAnswered && isSelected && !isCorrect && <XCircle className="size-5 shrink-0" />}
                </button>
              );
            })}
          </div>

          {hasAnswered && (
            <div className="mt-6 rounded-xl bg-muted p-4">
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Explanation
              </p>
              <p className="prose-reading text-sm text-foreground">{question.explanation}</p>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mt-4 text-xs font-semibold text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
