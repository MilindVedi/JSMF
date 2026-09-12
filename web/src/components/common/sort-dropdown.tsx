"use client";

import { ArrowDownUp, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SortDropdownOption<T extends string> {
  value: T;
  label: string;
  /** Options that are opposite directions of the same underlying sort (e.g.
   *  "Recently attempted" / "Least recently attempted") share a `group` id —
   *  the dropdown gives each group its own subtle background tint so related
   *  pairs are visually distinguishable from unrelated ones in a long list.
   *  Options without a `group` each get their own standalone tint. */
  group?: string;
}

/** Purely categorical tints (not semantic like success/error) for telling
 *  unrelated sort-option groups apart at a glance — cycles if there are more
 *  groups than colors. */
const GROUP_TINT_CLASSES = [
  "bg-chart-1/10",
  "bg-chart-2/10",
  "bg-chart-3/10",
  "bg-chart-4/10",
  "bg-chart-5/10",
];

function buildGroupTints<T extends string>(options: SortDropdownOption<T>[]): Map<string, string> {
  const tints = new Map<string, string>();
  let nextIndex = 0;
  for (const opt of options) {
    const key = opt.group ?? `__solo:${opt.value}`;
    if (!tints.has(key)) {
      tints.set(key, GROUP_TINT_CLASSES[nextIndex % GROUP_TINT_CLASSES.length]);
      nextIndex += 1;
    }
  }
  return tints;
}

export function SortDropdown<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: SortDropdownOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  const groupTints = buildGroupTints(options);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm font-medium text-foreground hover:bg-muted",
          className
        )}
      >
        <ArrowDownUp className="size-3.5 text-muted-foreground" />
        <span className="max-w-40 truncate sm:max-w-none">{current?.label ?? "Sort"}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 overflow-hidden p-0">
        <div className="max-h-80 overflow-y-auto py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:brightness-95",
                groupTints.get(opt.group ?? `__solo:${opt.value}`)
              )}
            >
              <Check
                className={cn(
                  "size-3.5 shrink-0 text-primary",
                  opt.value === value ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="flex-1 truncate text-foreground">{opt.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
