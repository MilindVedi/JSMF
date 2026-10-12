"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TimerDisplay } from "../timer-display";
import { KeyboardShortcutsPopover } from "../keyboard-shortcuts-popover";
import { EXAM_WARN_AT_SEC as WARN_AT_SEC, initialsOf as initials } from "@jsmf/core/domain";

export function ExamHeader({
  title,
  timed,
  durationSec,
  onTimeUp,
  studentName,
  avatarUrl,
  exitHref,
}: {
  title: string;
  timed: boolean;
  durationSec?: number;
  onTimeUp?: () => void;
  studentName: string;
  avatarUrl?: string;
  exitHref: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background px-3 sm:gap-3 sm:px-5">
      <Link
        href={exitHref}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Save & exit"
        title="Save & exit — saved answers are kept"
      >
        <ArrowLeft className="size-4" />
      </Link>

      <div className="hidden md:block">
        <Logo className="scale-90" />
      </div>
      <span className="hidden h-6 w-px bg-border md:block" aria-hidden />
      <h1 className="min-w-0 truncate font-display text-sm font-semibold text-foreground sm:text-base">{title}</h1>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
        {/* Also at 0: a test reopened after its time ran out must still auto-submit. */}
        {timed && durationSec !== undefined ? (
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Time Left</span>
            <TimerDisplay
              durationSec={durationSec}
              onTimeUp={onTimeUp}
              warnAtSec={WARN_AT_SEC}
              withHours
              className="rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
        ) : null}
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
              {initials(studentName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[10rem] truncate text-sm font-medium text-foreground lg:inline">
            {studentName || "Student"}
          </span>
        </div>
        <span className="hidden sm:block">
          <KeyboardShortcutsPopover />
        </span>
      </div>
    </header>
  );
}
