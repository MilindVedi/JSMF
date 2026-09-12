"use client";

import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  id: string;
  label: string;
  hint?: string;
}

export function MultiSelectPopover({
  label,
  options,
  selected,
  onChange,
  className,
  allOption,
  triggerLabel,
  singleSelect,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  /** An optional pseudo-option rendered above a divider, e.g. "All Exams" —
   *  shown checked whenever the selection is empty or covers every option
   *  (both mean "unfiltered"), and clicking it always resets to the empty,
   *  unfiltered selection. Ignored when `singleSelect` is set — a
   *  single-select list always has exactly one option selected. */
  allOption?: string;
  /** Override the default "label + count badge" trigger text — e.g. to show
   *  the actual selection ("NEET-PG", "All Exams") instead of a generic
   *  label, when that reads better than a count. */
  triggerLabel?: string;
  /** Renders radio-style behavior instead of checkboxes: picking an option
   *  replaces the selection instead of adding to it, and exactly one option
   *  is always selected (there's no "clear" or "all" state). */
  singleSelect?: boolean;
}) {
  function toggle(id: string) {
    if (singleSelect) {
      onChange([id]);
      return;
    }
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const isAllSelected = !singleSelect && (selected.length === 0 || selected.length >= options.length);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm font-medium text-foreground hover:bg-muted",
          selected.length > 0 && !isAllSelected && "border-primary/50 bg-primary/5 text-primary",
          className
        )}
      >
        {triggerLabel ?? label}
        {!triggerLabel && !singleSelect && selected.length > 0 && (
          <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        {allOption && !singleSelect && (
          <>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <Checkbox checked={isAllSelected} onCheckedChange={() => onChange([])} />
              <span className="flex-1 font-medium text-foreground">{allOption}</span>
            </label>
            <div className="my-1 border-t border-border" />
          </>
        )}
        <div className="max-h-72 overflow-y-auto">
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={selected.includes(opt.id)}
                onCheckedChange={() => toggle(opt.id)}
              />
              <span className="flex-1 truncate text-foreground">{opt.label}</span>
              {opt.hint && <span className="text-xs text-muted-foreground">{opt.hint}</span>}
            </label>
          ))}
        </div>
        {!singleSelect && selected.length > 0 && !allOption && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear selection
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
