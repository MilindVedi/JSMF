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
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm font-medium text-foreground hover:bg-muted",
          selected.length > 0 && "border-primary/50 bg-primary/5 text-primary",
          className
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
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
        {selected.length > 0 && (
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
