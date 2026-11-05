"use client";

import { cn } from "@/lib/utils";

export interface FilterTabOption<T extends string> {
  value: T;
  label: string;
  /** Shown beside the label, e.g. how many rows that tab holds. */
  count?: number;
}

/**
 * The row of filter tabs above a list — Question Bank's statuses, Revision's
 * sections, Attempt History's session types.
 *
 * Its own component rather than the `ui/tabs` primitive, which is built for
 * tabbed panels: it packs its triggers into a fixed 32px grey tray with 6px of
 * padding and scrolls them sideways when they do not fit, so "All 1 · Question
 * Bank 1 · Custom Test 0 · Bookmarks Revision 0 · Wrong Questions Revision 0"
 * came out as a cramped strip with two scroll arrows under it. These are
 * filters, not panels, so they wrap onto a second line instead and each gets
 * room to be read.
 *
 * The chosen one is a solid brand pill; the rest are plain text that take a
 * tint on hover. A count rides along in a soft badge — legible on the pill as
 * well, which a muted grey number would not be.
 *
 * `role="tablist"` with arrow-key movement, because that is what this behaves
 * like to a screen reader even though it is not the panel primitive.
 */
export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
  className,
  label = "Filter",
}: {
  value: T;
  options: readonly FilterTabOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  /** Names the group for screen readers, e.g. "Filter by status". */
  label?: string;
}) {
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    // Follow the selection, so the keyboard does not land on a tab it left.
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      "[role=tab]"
    );
    buttons?.[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.6875rem] font-bold tabular-nums",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
