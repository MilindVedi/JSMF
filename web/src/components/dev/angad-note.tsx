"use client";

import type { ReactNode } from "react";
import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A single, consistent "reviewer note" affordance: a button that says what
 * it is, revealing the actual reasoning only on click instead of leaving a
 * paragraph of review-only commentary sitting permanently in the layout.
 * Not part of the real product — every usage of this is something to strip
 * out once Angad has actually weighed in on it.
 */
export function AngadNote({
  children,
  compact,
  align = "end",
}: {
  children: ReactNode;
  /** Icon-only trigger for tight spaces (e.g. next to the streak chip). */
  compact?: boolean;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Note for Angad"
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-colors",
              compact
                ? "size-6 justify-center border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                : "border-dashed border-border bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
            )}
          />
        }
      >
        <StickyNote className="size-3.5" />
        {!compact && "Note for Angad"}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 gap-2 p-3 text-sm text-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}
