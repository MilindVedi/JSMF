"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { OpenSlot } from "@/lib/api/mentorship";

/**
 * Pick a date, then a time — the open slots grouped by local date in the
 * offering's timezone (IST), so a visitor in another zone still sees the
 * times Dr. Angad means. Only dates with at least one open time are shown.
 *
 * Shared by booking and by moving an existing booking.
 */
export function SlotPicker({
  slots,
  timeZone,
  selectedDate,
  onSelectDate,
  selected,
  onSelect,
}: {
  slots: OpenSlot[] | null;
  timeZone: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  selected: string | null;
  onSelect: (startsAt: string) => void;
}) {
  const days = useMemo(() => groupByDay(slots ?? [], timeZone), [slots, timeZone]);
  const activeDay = days.find((day) => day.key === selectedDate) ?? null;

  if (slots === null) {
    return (
      <div className="grid min-h-40 place-items-center rounded-3xl border border-border bg-card">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        No open times right now. New times open up regularly — please check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="no-scrollbar -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Choose a date">
        {days.map((day) => {
          const active = day.key === selectedDate;
          return (
            <button
              key={day.key}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelectDate(day.key)}
              className={`flex w-[3.75rem] shrink-0 snap-start flex-col items-center rounded-2xl border px-2 py-3 transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-editorial"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              <span className={`text-[10px] font-bold uppercase ${active ? "opacity-90" : "text-muted-foreground"}`}>{day.weekday}</span>
              <span className="mt-1 font-display text-xl font-semibold leading-none">{day.day}</span>
              <span className={`mt-1 text-[10px] ${active ? "opacity-90" : "text-muted-foreground"}`}>{day.month}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 sm:p-5">
        {!activeDay ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Choose a date above to see open times.</p>
        ) : (
          <>
            <p className="mb-4 text-sm font-semibold text-brand-deep">{activeDay.label}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="listbox" aria-label="Choose a time">
              {activeDay.slots.map((slot) => {
                const active = slot.startsAt === selected;
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onSelect(slot.startsAt)}
                    className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    }`}
                  >
                    {timeLabel(slot.startsAt, timeZone)}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <p className="mt-4 text-xs text-muted-foreground">All times are in {zoneLabel(timeZone)}.</p>
      </div>
    </div>
  );
}

interface Day {
  key: string;
  weekday: string;
  day: string;
  month: string;
  label: string;
  slots: OpenSlot[];
}

function groupByDay(slots: OpenSlot[], timeZone: string): Day[] {
  const keyFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const map = new Map<string, Day>();

  for (const slot of slots) {
    const date = new Date(slot.startsAt);
    const key = keyFormat.format(date);
    let day = map.get(key);
    if (!day) {
      day = {
        key,
        weekday: new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "short" }).format(date),
        day: new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric" }).format(date),
        month: new Intl.DateTimeFormat("en-IN", { timeZone, month: "short" }).format(date),
        label: new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(date),
        slots: [],
      };
      map.set(key, day);
    }
    day.slots.push(slot);
  }

  return [...map.values()];
}

/** "7:00 pm" in the offering's zone. */
export function timeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .toLowerCase();
}

/** The local date key (YYYY-MM-DD) a slot falls on, in the offering's zone. */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** "Wed, 14 Oct · 7:00 pm" in the offering's zone, for summaries. */
export function slotSummary(iso: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
  return `${date} · ${timeLabel(iso, timeZone)}`;
}

function zoneLabel(timeZone: string): string {
  return timeZone === "Asia/Kolkata" ? "IST (India)" : timeZone;
}
