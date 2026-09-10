"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/common/logo";
import { TimerDisplay } from "./timer-display";
import { BookmarkButton } from "./bookmark-button";
import { FlagButton } from "./flag-button";
import { KeyboardShortcutsPopover } from "./keyboard-shortcuts-popover";

export function PracticeTopbar({
  current,
  total,
  timed,
  durationSec,
  onTimeUp,
  isBookmarked,
  onToggleBookmark,
  isFlagged,
  onToggleFlag,
  exitHref,
}: {
  current: number;
  total: number;
  timed: boolean;
  durationSec?: number;
  onTimeUp?: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  isFlagged: boolean;
  onToggleFlag: () => void;
  exitHref: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-3 sm:px-5">
      <Link
        href={exitHref}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        <span className="hidden sm:inline">Save &amp; exit</span>
      </Link>

      <div className="hidden sm:block">
        <Logo className="scale-90" />
      </div>

      <div className="mx-auto flex w-full max-w-xs flex-1 flex-col items-center gap-1 sm:max-w-sm">
        <span className="text-xs font-medium text-muted-foreground">
          Question {current + 1} of {total}
        </span>
        <Progress value={((current + 1) / total) * 100} className="w-full" />
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {timed && durationSec && <TimerDisplay durationSec={durationSec} onTimeUp={onTimeUp} />}
        <FlagButton isFlagged={isFlagged} onToggle={onToggleFlag} />
        <BookmarkButton isBookmarked={isBookmarked} onToggle={onToggleBookmark} />
        <KeyboardShortcutsPopover />
      </div>
    </header>
  );
}
