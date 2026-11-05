"use client";

import { Lock } from "lucide-react";
import type { ExamSectionWindow } from "@jsmf/core/domain";
import { cn } from "@/lib/utils";

/**
 * The console's section strip. With time-bound sections only the running
 * one can be opened — the rest show a lock, as on the real test. Otherwise
 * any section is a jump to its first question.
 */
export function ExamSectionTabs({
  sections,
  currentSection,
  locked,
  onSelect,
}: {
  sections: ExamSectionWindow[];
  /** The section of the question on screen. */
  currentSection: number;
  locked: boolean;
  onSelect: (firstIndex: number) => void;
}) {
  return (
    <nav aria-label="Sections" className="border-b border-border bg-muted/40">
      <ul className="mx-auto flex max-w-full gap-1 overflow-x-auto px-3 py-1.5 sm:px-5">
        {sections.map((section) => {
          const current = section.index === currentSection;
          const disabled = locked && !current;
          return (
            <li key={section.index} className="shrink-0">
              <button
                type="button"
                disabled={disabled}
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(section.firstPosition)}
                title={
                  disabled
                    ? section.index < currentSection
                      ? `${section.name} is closed`
                      : `${section.name} opens when this section's time ends`
                    : undefined
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  current
                    ? "bg-primary text-primary-foreground"
                    : disabled
                      ? "cursor-not-allowed text-muted-foreground/70"
                      : "text-foreground hover:bg-muted"
                )}
              >
                {disabled && <Lock className="size-3" aria-hidden />}
                {section.name}
                <span className={cn("font-normal tabular-nums", current ? "opacity-80" : "text-muted-foreground")}>
                  {section.questions}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
