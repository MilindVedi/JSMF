"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { QuestionListRow } from "@/components/question-bank/question-list-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSkeleton, QueryError } from "@/components/pyq/query-states";
import { useStartSession, useWrongQuestions } from "@/hooks/pyq";

export default function WrongQuestionsPage() {
  const { data: wrongQuestions = [], error, isPending, refetch } = useWrongQuestions();
  const startSession = useStartSession();

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

      {error ? (
        <QueryError error={error} onRetry={() => refetch()} title="Couldn't load your wrong questions" />
      ) : isPending ? (
        <ListSkeleton />
      ) : wrongQuestions.length === 0 ? (
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
            {wrongQuestions.map((question, i) => (
              <QuestionListRow
                key={question.id}
                question={question}
                number={i + 1}
                status="incorrect"
                onClick={() =>
                  startSession({
                    mode: "browse",
                    label: "Wrong Question Review",
                    questionIds: [question.id],
                  })
                }
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
