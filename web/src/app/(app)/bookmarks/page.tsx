"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { QuestionListRow } from "@/components/question-bank/question-list-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSkeleton, QueryError } from "@/components/pyq/query-states";
import { useBookmarks, useStartSession } from "@/hooks/pyq";

export default function BookmarksPage() {
  const { data: items = [], error, isPending, refetch } = useBookmarks();
  const startSession = useStartSession();

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Bookmarks"
        description="Questions you've saved for later review."
        actions={
          items.length > 0 ? (
            <Button
              onClick={() =>
                startSession({
                  mode: "bookmarks",
                  label: "My Bookmarks",
                  questionIds: items.map((item) => item.question.id),
                })
              }
            >
              Practice all bookmarks
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <QueryError error={error} onRetry={() => refetch()} title="Couldn't load your bookmarks" />
      ) : isPending ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          description="Save questions while practicing to revisit them later here."
          action={
            <Link href="/question-bank" className={buttonVariants({ size: "sm" })}>
              Go to Question Bank
            </Link>
          }
        />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-border">
            {items.map(({ question, userStatus }, i) => (
              <QuestionListRow
                key={question.id}
                question={question}
                number={i + 1}
                status={userStatus ?? "unattempted"}
                onClick={() =>
                  startSession({
                    mode: "browse",
                    label: "Bookmarked Question",
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
