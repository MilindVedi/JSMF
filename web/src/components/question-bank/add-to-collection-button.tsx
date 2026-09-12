"use client";

import { Library } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useCollectionsStore } from "@/store/collections-store";
import { cn } from "@/lib/utils";

/**
 * Lets a student add/remove a single question from any of their existing
 * collections. Collection creation/renaming/deletion isn't built yet (see
 * docs/07-future-scope.md) — this only toggles membership in what already
 * exists, which is why it renders nothing when there are no collections at
 * all rather than offering to create one.
 */
export function AddToCollectionButton({ questionId }: { questionId: string }) {
  const collections = useCollectionsStore((s) => s.collections);
  const toggleQuestionInCollection = useCollectionsStore((s) => s.toggleQuestionInCollection);

  if (collections.length === 0) return null;

  const memberCount = collections.filter((c) => c.questionIds.includes(questionId)).length;

  return (
    <Popover>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        aria-label={memberCount > 0 ? `In ${memberCount} collections` : "Add to collection"}
        title={memberCount > 0 ? `In ${memberCount} collection${memberCount === 1 ? "" : "s"}` : "Add to collection"}
        className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-colors",
          memberCount > 0
            ? "text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Library className={cn("size-4", memberCount > 0 && "fill-primary/20")} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-60 p-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-2 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Add to collection
        </p>
        <div className="max-h-56 overflow-y-auto">
          {collections.map((c) => {
            const checked = c.questionIds.includes(questionId);
            return (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleQuestionInCollection(c.id, questionId)}
                />
                <span className="flex-1 truncate text-foreground">{c.name}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
