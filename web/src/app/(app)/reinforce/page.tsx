"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { QuestionListRow } from "@/components/question-bank/question-list-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoading, QueryError } from "@/components/pyq/query-states";
import { useReinforce, useStartSession } from "@/hooks/pyq";

const RECENT_WINDOW_DAYS = 7;

type Mode = "all" | "recent" | "notRevisited";

export default function ReinforcePage() {
  const startSession = useStartSession();
  const [mode, setMode] = useState<Mode>("all");
  const { data: facets, error, refetch } = useReinforce(RECENT_WINDOW_DAYS);

  if (error) return <QueryError error={error} onRetry={() => refetch()} title="Couldn't load your correct answers" />;
  if (!facets) return <PageLoading />;

  const MODES: { value: Mode; label: string; count: number }[] = [
    { value: "all", label: "All correct", count: facets.all.length },
    { value: "recent", label: "Recently correct", count: facets.recent.length },
    { value: "notRevisited", label: "Not revisited", count: facets.notRevisited.length },
  ];

  const activeList =
    mode === "recent" ? facets.recent : mode === "notRevisited" ? facets.notRevisited : facets.all;

  const MODE_BLURB: Record<Mode, string> = {
    all: "Every question whose most recent attempt was correct.",
    recent: `Answered correctly in the last ${RECENT_WINDOW_DAYS} days.`,
    notRevisited: `Answered correctly, but not looked at again in over ${RECENT_WINDOW_DAYS} days — worth reinforcing.`,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reinforce"
        description="Questions you've answered correctly and may want to revisit to reinforce the concept."
        actions={
          activeList.length > 0 ? (
            <Button
              onClick={() =>
                startSession({
                  mode: "browse",
                  label: "Reinforce Practice",
                  questionIds: activeList.map((q) => q.id),
                })
              }
            >
              Practise {activeList.length}
            </Button>
          ) : undefined
        }
      />

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          {MODES.map((m) => (
            <TabsTrigger key={m.value} value={m.value}>
              {m.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{m.count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <p className="text-sm text-muted-foreground">{MODE_BLURB[mode]}</p>

      {activeList.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing here yet"
          description="Questions you answer correctly will show up here once there's something to reinforce."
          action={
            <Link href="/question-bank" className={buttonVariants({ size: "sm" })}>
              Go to Question Bank
            </Link>
          }
        />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-border">
            {activeList.map((question, i) => (
              <QuestionListRow
                key={question.id}
                question={question}
                number={i + 1}
                status="correct"
                onClick={() =>
                  startSession({
                    mode: "browse",
                    label: "Reinforce Review",
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
