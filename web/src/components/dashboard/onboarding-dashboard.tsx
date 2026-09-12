import { ArrowRight, BookOpen, CheckCircle2, Circle, Repeat, Sparkles, TrendingUp } from "lucide-react";
import { StreakCard } from "./streak-card";
import { QuickActionCard } from "./quick-action-card";
import { Button } from "@/components/ui/button";
import { EXAMS } from "@/data/mock/exams";
import type { ExamId } from "@/types";
import { cn } from "@/lib/utils";

const HOW_IT_WORKS = [
  { icon: BookOpen, text: "Practice recall-based PYQs" },
  { icon: Sparkles, text: "Learn from explanations" },
  { icon: TrendingUp, text: "Track weak areas" },
  { icon: Repeat, text: "Revise what you got wrong" },
];

/**
 * Shown instead of the regular dashboard for a genuinely new account — no
 * sessions ever created (see the `sessionList.length === 0` check in
 * dashboard/page.tsx). The goal is a student knows what to do next within a
 * few seconds, rather than being shown a grid of zeroed-out stat cards.
 */
export function OnboardingDashboard({
  firstName,
  targetExamId,
  hasBookmark,
  hasStreak = false,
  onStartFirstPractice,
}: {
  firstName: string;
  targetExamId: ExamId;
  hasBookmark: boolean;
  hasStreak?: boolean;
  onStartFirstPractice: () => void;
}) {
  const exam = EXAMS.find((e) => e.id === targetExamId);

  const checklist = [
    { label: "Choose your exam", done: true },
    { label: "Complete your first practice session", done: false },
    { label: "Build your first streak", done: hasStreak },
    { label: "Bookmark a question for revision", done: hasBookmark },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="font-heading text-xl font-semibold text-foreground sm:text-2xl">
          Welcome to JSMF, {firstName}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Let&apos;s get your preparation started.</p>

        <div className="mt-5 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
          <div className="flex h-full flex-col justify-center rounded-xl border border-border bg-muted/30 p-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Your selected exam
            </p>
            <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
              {exam?.shortName ?? targetExamId}
            </p>
          </div>
          <StreakCard />
        </div>

        <Button size="lg" className="mt-5 w-full sm:w-fit" onClick={onStartFirstPractice}>
          Start your first practice
          <ArrowRight className="size-4" />
        </Button>
      </div>

      <div>
        <h2 className="mb-3 font-heading text-sm font-semibold text-foreground">Or explore on your own</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <QuickActionCard
            icon={BookOpen}
            label="Question Bank"
            description="Browse PYQs by subject, year & topic."
            href="/question-bank"
          />
          <QuickActionCard
            icon={Sparkles}
            label="Custom Test"
            description="Build a test around your own preferences."
            href="/custom-test/new"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">Getting started</h2>
          <div className="rounded-xl border border-border bg-card p-4">
            <ul className="space-y-2.5">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5 text-sm">
                  {item.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-teal" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground/40" />
                  )}
                  <span className={cn(item.done ? "text-foreground" : "text-muted-foreground")}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">How JSMF works</h2>
          <div className="rounded-xl border border-border bg-card p-4">
            <ul className="space-y-2.5">
              {HOW_IT_WORKS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Icon className="size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
