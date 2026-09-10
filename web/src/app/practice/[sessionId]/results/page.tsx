"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { usePracticeStore } from "@/store/practice-store";
import { getQuestionById } from "@/data/mock/questions";
import { getSessionSubjectPerformance, getSessionSummary } from "@/lib/selectors";
import { getSubjectById } from "@/data/mock/subjects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SubjectBadge } from "@/components/common/subject-badge";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import type { TestSession } from "@/types";

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** The wording adapts to how the session was started — "Test completed" is
 *  wrong for a question-bank browse, and vice versa. */
function completionKicker(session: TestSession) {
  switch (session.mode) {
    case "custom-test":
      return "Test completed";
    case "wrong-questions":
      return "Revision complete";
    case "bookmarks":
      return "Bookmark review complete";
    default:
      return session.label;
  }
}

function nextAction(session: TestSession): { label: string; href: string } {
  switch (session.mode) {
    case "custom-test":
      return { label: "Start another test", href: "/custom-test/new" };
    case "wrong-questions":
    case "bookmarks":
      return { label: "Back to Revision", href: "/revision" };
    default:
      return { label: "Back to Question Bank", href: "/question-bank" };
  }
}

export default function ResultsPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const session = usePracticeStore((s) => s.sessions[params.sessionId]);
  const hasHydrated = usePracticeStore((s) => s.hasHydrated);

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          icon={AlertTriangle}
          title="Results not found"
          description="This session doesn't exist or its data has been cleared."
          action={<Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>}
        />
      </div>
    );
  }

  const questions = session.questionIds
    .map((id) => getQuestionById(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q));
  const summary = getSessionSummary(session, questions);
  const subjectPerformance = getSessionSubjectPerformance(session, questions);
  const isTimed = Boolean(session.config.timed && session.config.durationSec);
  const action = nextAction(session);

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-8 sm:py-10">
      <div className="mb-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">{completionKicker(session)}</p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-foreground">
          {summary.accuracy}% accuracy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.correct} correct · {summary.incorrect} incorrect
          {summary.unattempted > 0 && ` · ${summary.unattempted} unattempted`} out of{" "}
          {summary.totalQuestions} questions
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Correct" value={summary.correct} tone="success" />
        <StatTile label="Incorrect" value={summary.incorrect} tone="error" />
        <StatTile label="Unattempted" value={summary.unattempted} tone="muted" />
        <StatTile
          label="Time taken"
          value={formatDuration(summary.totalTimeSec)}
          tone="muted"
          sub={
            isTimed
              ? `of ${Math.round(session.config.durationSec! / 60)} min limit`
              : undefined
          }
        />
      </div>

      {subjectPerformance.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Subject performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {subjectPerformance.map((s) => (
              <div key={s.subjectId} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SubjectBadge subjectId={s.subjectId} />
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{s.accuracy}%</span> ·{" "}
                    {s.correct}/{s.attempted} correct
                  </p>
                </div>
                <Progress value={s.accuracy} aria-label={`${s.subjectId} accuracy`} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {questions.map((q, i) => {
            const attempt = session.attempts[q.id];
            const subject = getSubjectById(q.subjectId);
            return (
              <Link
                key={q.id}
                href={`/practice/${session.id}?i=${i}`}
                className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    !attempt && "bg-muted text-muted-foreground",
                    attempt?.isCorrect && "bg-success text-success-foreground",
                    attempt && !attempt.isCorrect && "bg-error text-error-foreground"
                  )}
                >
                  {!attempt ? (
                    <Circle className="size-3.5" />
                  ) : attempt.isCorrect ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <XCircle className="size-4" />
                  )}
                </span>
                <span className="w-7 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                  Q{i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">{q.stem}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {subject?.name}
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => router.push(`/practice/${session.id}/review`)}>
            Review answers
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.push(action.href)}>
            {action.label}
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.push("/history")}>
            View all history
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {summary.totalQuestions} question{summary.totalQuestions === 1 ? "" : "s"} ·
          {summary.incorrect > 0 ? (
            <span className="rounded-full bg-error px-2 py-0.5 text-[0.7rem] font-semibold text-error-foreground">
              {summary.incorrect} to review
            </span>
          ) : summary.unattempted > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
              {summary.unattempted} to review
            </span>
          ) : (
            <span className="rounded-full bg-success px-2 py-0.5 text-[0.7rem] font-semibold text-success-foreground">
              All correct
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string | number;
  tone: "success" | "error" | "muted";
  sub?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border px-3 py-3 text-center",
        tone === "success" && "bg-success/50",
        tone === "error" && "bg-error/50",
        tone === "muted" && "bg-muted/50"
      )}
    >
      <p className="font-heading text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{sub}</p>}
    </div>
  );
}
