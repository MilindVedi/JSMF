"use client";

import { useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function toISO(date: Date) {
  return format(date, "yyyy-MM-dd");
}

/**
 * A calendar-grid date range picker (Popover + month grid, click-click range
 * selection with a hover preview) replacing the pair of native
 * `<input type="date">` fields previously used for custom ranges — those
 * work but look and feel inconsistent across browsers and don't visualize
 * the selected span the way a calendar does.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  className,
}: {
  /** `YYYY-MM-DD`, or `""` if unset. */
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(from ? parseISO(from) : new Date()));
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [hoverDay, setHoverDay] = useState<Date | null>(null);

  // Re-seed the draft from committed props each time the popover opens, so a
  // cancelled edit (closing without "Apply") doesn't leak a half-made
  // selection into the next time it's opened. Done in the open-change handler
  // rather than an effect, since this is a direct response to the popover
  // opening, not a synchronization with an external system.
  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftFrom(from);
      setDraftTo(to);
      setViewMonth(startOfMonth(from ? parseISO(from) : new Date()));
    }
    setOpen(next);
  }

  const draftFromDate = draftFrom ? parseISO(draftFrom) : null;
  const draftToDate = draftTo ? parseISO(draftTo) : null;

  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function handleDayClick(day: Date) {
    if (!draftFromDate || (draftFromDate && draftToDate)) {
      setDraftFrom(toISO(day));
      setDraftTo("");
      return;
    }
    if (isBefore(day, draftFromDate)) {
      setDraftTo(draftFrom);
      setDraftFrom(toISO(day));
    } else {
      setDraftTo(toISO(day));
    }
  }

  function apply() {
    onChange(draftFrom, draftTo);
    setOpen(false);
  }

  function clear() {
    setDraftFrom("");
    setDraftTo("");
    onChange("", "");
    setOpen(false);
  }

  const previewEnd = draftToDate ?? hoverDay;
  const triggerLabel =
    from && to
      ? `${format(parseISO(from), "MMM d, yyyy")} – ${format(parseISO(to), "MMM d, yyyy")}`
      : "Pick a date range";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-xs font-medium text-foreground hover:bg-muted",
          className
        )}
      >
        <CalendarDays className="size-3.5 text-muted-foreground" />
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
            aria-label="Previous month"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="text-sm font-semibold text-foreground">{format(viewMonth, "MMMM yyyy")}</p>
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-[0.7rem] font-medium text-muted-foreground">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHoverDay(null)}>
          {days.map((day) => {
            const inMonth = isSameMonth(day, viewMonth);
            const isStart = Boolean(draftFromDate && isSameDay(day, draftFromDate));
            const isEnd = Boolean(draftToDate && isSameDay(day, draftToDate));
            const isEndpoint = isStart || isEnd;
            // Spans the full span (inclusive of both endpoints) so the tinted
            // band drawn on the outer cell reaches all the way into the
            // endpoint circles instead of stopping just short of them.
            const inSpan =
              draftFromDate &&
              previewEnd &&
              !isBefore(previewEnd, draftFromDate) &&
              isWithinInterval(day, {
                start: draftFromDate,
                end: isAfter(previewEnd, draftFromDate) ? previewEnd : draftFromDate,
              });

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex items-center justify-center",
                  inMonth && inSpan && "bg-primary/10",
                  inMonth && inSpan && isStart && "rounded-l-full",
                  inMonth && inSpan && isEnd && "rounded-r-full"
                )}
              >
                <button
                  type="button"
                  disabled={!inMonth}
                  onMouseEnter={() => setHoverDay(day)}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-sm transition-colors",
                    !inMonth && "invisible",
                    inMonth && !isEndpoint && "text-foreground hover:bg-muted",
                    isEndpoint && "bg-primary font-semibold text-primary-foreground"
                  )}
                >
                  {format(day, "d")}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
          <Button size="sm" onClick={apply} disabled={!draftFrom}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
