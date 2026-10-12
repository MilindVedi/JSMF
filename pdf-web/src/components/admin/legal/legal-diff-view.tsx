"use client";

import { useMemo } from "react";
import { diffLines, flattenLegal } from "@/lib/legal-diff";
import type { LegalSection } from "@/lib/legal";
import { cn } from "@/lib/utils";

export interface DiffSide {
  title: string;
  sections: LegalSection[];
}

const LINE_STYLE = {
  same: "text-muted-foreground",
  added: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  removed: "bg-red-500/10 text-red-800 dark:text-red-300",
} as const;

const MARK = { same: " ", added: "+", removed: "-" } as const;

/** Line-by-line comparison of two versions: green added, red removed, the rest muted. */
export function LegalDiffView({ before, after }: { before: DiffSide; after: DiffSide }) {
  const lines = useMemo(
    () =>
      diffLines(flattenLegal(before.title, before.sections), flattenLegal(after.title, after.sections)),
    [before, after],
  );
  const changed = lines.some((line) => line.kind !== "same");

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {!changed && (
        <p className="border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          No differences.
        </p>
      )}
      <pre className="overflow-x-auto py-2 font-mono text-xs leading-relaxed">
        {lines.map((line, index) => (
          <div key={index} className={cn("flex gap-3 px-3 whitespace-pre-wrap", LINE_STYLE[line.kind])}>
            <span className="w-3 shrink-0 select-none" aria-hidden>
              {MARK[line.kind]}
            </span>
            <span className="min-w-0 flex-1 break-words">{line.text || " "}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
