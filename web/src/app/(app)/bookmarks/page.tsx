"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bookmark, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { QuestionListRow } from "@/components/question-bank/question-list-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { getQuestionById } from "@/data/mock/questions";
import { getQuestionStatusMap } from "@/lib/selectors";
import { useStartSession } from "@/lib/use-start-session";
import type { BookmarkEntry, Question } from "@/types";

export default function BookmarksPage() {
  const hasHydrated = useBookmarksStore((s) => s.hasHydrated);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const sessions = usePracticeStore((s) => s.sessions);
  const startSession = useStartSession();

  const items = useMemo(
    () =>
      bookmarks
        .map((bookmark) => ({ bookmark, question: getQuestionById(bookmark.questionId) }))
        .filter(
          (item): item is { bookmark: BookmarkEntry; question: Question } => Boolean(item.question)
        ),
    [bookmarks]
  );

  const statusMap = useMemo(() => getQuestionStatusMap(Object.values(sessions)), [sessions]);

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

      {items.length === 0 ? (
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
            {items.map(({ bookmark, question }, i) => (
              <QuestionListRow
                key={bookmark.id}
                question={question}
                number={i + 1}
                status={statusMap.get(question.id) ?? "unattempted"}
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
