"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bookmark, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SubjectBadge } from "@/components/common/subject-badge";
import { ExamBadge } from "@/components/common/exam-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { getQuestionById } from "@/data/mock/questions";
import { useStartSession } from "@/lib/use-start-session";
import type { BookmarkEntry, Question } from "@/types";

export default function BookmarksPage() {
  const hasHydrated = useBookmarksStore((s) => s.hasHydrated);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const toggleBookmark = useBookmarksStore((s) => s.toggleBookmark);
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
            {items.map(({ bookmark, question }) => (
              <div
                key={bookmark.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  startSession({
                    mode: "browse",
                    label: "Bookmarked Question",
                    questionIds: [question.id],
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    startSession({
                      mode: "browse",
                      label: "Bookmarked Question",
                      questionIds: [question.id],
                    });
                  }
                }}
                className="flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ExamBadge examId={question.examId} />
                    <SubjectBadge subjectId={question.subjectId} />
                    <span className="text-xs text-muted-foreground">{question.year}</span>
                  </div>
                  <p className="line-clamp-2 text-sm text-foreground">{question.stem}</p>
                </div>
                <button
                  type="button"
                  aria-label="Remove bookmark"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBookmark(question.id);
                  }}
                  className="shrink-0 rounded-md p-1.5 text-accent-foreground transition-colors hover:bg-muted"
                >
                  <Bookmark className="size-4 fill-accent-foreground" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
