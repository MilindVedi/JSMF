"use client";

import { Loader2 } from "lucide-react";
import { StreakGoalCelebrator } from "@/components/layout/streak-goal-celebrator";
import { useRequireAuth } from "@/lib/use-require-auth";

/**
 * Deliberately minimal — no sidebar, no topbar. This is a sibling of
 * (app) and (marketing), not nested inside (app), specifically so the
 * practice/solving experience can stay free of the app shell's chrome.
 * See docs/05-ui-ux-plan.md, "Navigation & App Shell".
 */
export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireAuth();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* The daily-goal moment usually happens here, on the answer that reaches it. */}
      <StreakGoalCelebrator inPlace />
      {children}
    </div>
  );
}
