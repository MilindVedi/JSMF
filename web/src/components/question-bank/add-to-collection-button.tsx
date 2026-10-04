"use client";

import { useState } from "react";
import { Library, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCollectionMembership, useCollections, useCreateCollection } from "@/hooks/pyq";
import { cn } from "@/lib/utils";

/**
 * Adds/removes a single question from the student's collections, or starts a
 * new collection containing it.
 */
export function AddToCollectionButton({ questionId }: { questionId: string }) {
  const { data: collections = [], isLoading } = useCollections();
  const membership = useCollectionMembership();
  const createCollection = useCreateCollection();
  const [name, setName] = useState("");

  const memberCount = collections.filter((c) => c.questionIds.includes(questionId)).length;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || createCollection.isPending) return;
    createCollection.mutate({ name: trimmed, questionIds: [questionId] }, { onSuccess: () => setName("") });
  }

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
          {isLoading && <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>}
          {collections.map((c) => {
            const checked = c.questionIds.includes(questionId);
            return (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  disabled={membership.isPending}
                  onCheckedChange={() =>
                    membership.mutate({ collectionId: c.id, questionId, member: !checked })
                  }
                />
                <span className="flex-1 truncate text-foreground">{c.name}</span>
              </label>
            );
          })}
        </div>
        <form onSubmit={handleCreate} className="mt-1 flex items-center gap-1.5 border-t border-border px-1 pt-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collection"
            maxLength={120}
            className="h-8 text-sm"
            aria-label="New collection name"
          />
          <button
            type="submit"
            disabled={!name.trim() || createCollection.isPending}
            aria-label="Create collection"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-4" />
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
