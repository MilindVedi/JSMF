"use client";

import { Flag } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function FlagButton({
  isFlagged,
  onToggle,
}: {
  isFlagged: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={onToggle}
        className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-colors",
          isFlagged ? "text-error-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        aria-pressed={isFlagged}
        aria-label="Flag this question for review"
      >
        <Flag className={cn("size-4.5", isFlagged && "fill-current")} />
      </TooltipTrigger>
      <TooltipContent>{isFlagged ? "Unflag" : "Flag for review"}</TooltipContent>
    </Tooltip>
  );
}
