"use client";

import { Bookmark } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function BookmarkButton({
  isBookmarked,
  onToggle,
}: {
  isBookmarked: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={onToggle}
        className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-colors",
          isBookmarked ? "text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        aria-pressed={isBookmarked}
        aria-label="Bookmark this question"
      >
        <Bookmark className={cn("size-4.5", isBookmarked && "fill-current")} />
      </TooltipTrigger>
      <TooltipContent>{isBookmarked ? "Remove bookmark" : "Bookmark question"}</TooltipContent>
    </Tooltip>
  );
}
