"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SubjectBadge } from "@/components/common/subject-badge";
import { ExamBadge } from "@/components/common/exam-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePracticeStore } from "@/store/practice-store";
import { QUESTIONS } from "@/data/mock/questions";
import { getWrongQuestions } from "@/lib/selectors";
import { useStartSession } from "@/lib/use-start-session";

export default function WrongQuestionsPage() {
  const hasHydrated = usePracticeStore((s) => s.hasHydrated);
  const sessions = usePracticeStore((s) => s.sessions);
  const startSession = useStartSession();

  const wrongQuestions = useMemo(
    () => (hasHydrated ? getWrongQuestions(Object.values(sessions), QUESTIONS) : []),
    [hasHydrated, sessions]
  );

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Wrong Questions"
        description="Questions whose most recent attempt was incorrect — worth another look."
        actions={
          wrongQuestions.length > 0 ? (
            <Button
              onClick={() =>
                startSession({
                  mode: "wrong-questions",
                  label: "Wrong Questions Revision",
                  questionIds: wrongQuestions.map((q) => q.id),
                })
              }
            >
              Practice all wrong questions
            </Button>
          ) : undefined
        }
      />

      {wrongQuestions.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No wrong questions yet — keep practicing!"
          description="Questions you get wrong will show up here so you can revise them until they stick."
          action={
            <Link href="/question-bank" className={buttonVariants({ size: "sm" })}>
              Go to Question Bank
            </Link>
          }
        />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-border">
            {wrongQuestions.map((question) => (
              <button
                key={question.id}
                type="button"
                onClick={() =>
                  startSession({
                    mode: "browse",
                    label: "Wrong Question Review",
                    questionIds: [question.id],
                  })
                }
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ExamBadge examId={question.examId} />
                    <SubjectBadge subjectId={question.subjectId} />
                    <span className="text-xs text-muted-foreground">{question.year}</span>
                  </div>
                  <p className="line-clamp-2 text-sm text-foreground">{question.stem}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
