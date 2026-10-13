import { DateTime } from 'luxon';

/**
 * Which one-to-one call times are open — the whole scheduling rule, with no
 * database and no clock of its own, so it can be tested exhaustively and every
 * caller (the public slot list, holding a slot, rescheduling) agrees on it.
 *
 * Times are generated in the offering's own timezone from:
 *   - weekly hours ("Monday 19:00–21:00"),
 *   - dated exceptions (block a day or part of it, or add an extra window),
 * then laid on a fixed grid — a slot starts at the window's start and every
 * `duration + buffer` minutes after — and filtered by minimum notice, the
 * booking window, and what is already taken.
 *
 * A slot occupies [start, start + duration + buffer): the call plus the gap
 * after it. That is exactly the range the database's exclusion constraint
 * compares, so "open here" and "accepted there" can never disagree.
 */

export interface OfferingSchedule {
  durationMinutes: number;
  bufferMinutes: number;
  /** IANA zone the weekly hours and dated exceptions are read in. */
  timezone: string;
  minNoticeMinutes: number;
  bookingWindowDays: number;
}

/** 1 = Monday … 7 = Sunday (ISO, as luxon reports it). */
export interface WeeklyWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface DatedException {
  /** Local calendar date in the offering's zone, `YYYY-MM-DD`. */
  date: string;
  kind: 'BLOCK' | 'EXTRA';
  /** Both null on a whole-day block. */
  startMinute: number | null;
  endMinute: number | null;
}

/** A time already taken: an active booking's [starts_at, blocked_until). */
export interface BusyRange {
  start: Date;
  end: Date;
}

export interface Slot {
  startsAt: Date;
  /** When the call itself ends. */
  endsAt: Date;
  /** endsAt plus the buffer: what booking it keeps free. */
  blockedUntil: Date;
}

export interface SlotQuery {
  offering: OfferingSchedule;
  rules: WeeklyWindow[];
  exceptions: DatedException[];
  busy: BusyRange[];
  now: Date;
  /** Optional narrowing of the result, e.g. one week of the calendar. */
  from?: Date;
  to?: Date;
}

/** Every open slot, earliest first. */
export function openSlots(query: SlotQuery): Slot[] {
  const { offering, now } = query;
  const zone = offering.timezone;
  const step = offering.durationMinutes + offering.bufferMinutes;

  const earliest = now.getTime() + offering.minNoticeMinutes * 60_000;
  const latest = now.getTime() + offering.bookingWindowDays * 24 * 60 * 60_000;
  const from = Math.max(earliest, query.from?.getTime() ?? -Infinity);
  const to = Math.min(latest, query.to?.getTime() ?? Infinity);
  if (from > to) return [];

  const exceptionsByDate = groupBy(query.exceptions, (e) => e.date);
  const busy = query.busy.map((range) => ({ start: range.start.getTime(), end: range.end.getTime() }));

  const slots: Slot[] = [];
  const firstDay = DateTime.fromMillis(from, { zone }).startOf('day');
  const lastDay = DateTime.fromMillis(to, { zone }).startOf('day');

  for (let day = firstDay; day <= lastDay; day = day.plus({ days: 1 })) {
    const date = day.toISODate()!;
    const windows = windowsForDay(day.weekday, query.rules, exceptionsByDate.get(date) ?? []);

    for (const window of windows) {
      for (let minute = window.start; minute + offering.durationMinutes <= window.end; minute += step) {
        const start = atLocalMinute(day, minute);
        const startMs = start.toMillis();
        if (startMs < from || startMs > to) continue;

        const endsMs = startMs + offering.durationMinutes * 60_000;
        const blockedMs = endsMs + offering.bufferMinutes * 60_000;
        if (busy.some((range) => startMs < range.end && range.start < blockedMs)) continue;

        slots.push({ startsAt: new Date(startMs), endsAt: new Date(endsMs), blockedUntil: new Date(blockedMs) });
      }
    }
  }

  return dedupeSorted(slots);
}

/**
 * The open slot starting at exactly `startsAt`, or null. How a requested time
 * is checked: the client sends a start, and only a start this rule would itself
 * have offered — to the millisecond — is accepted.
 */
export function findOpenSlot(query: SlotQuery, startsAt: Date): Slot | null {
  const target = startsAt.getTime();
  if (Number.isNaN(target)) return null;

  // Only the one day the request falls on needs generating.
  const zone = query.offering.timezone;
  const day = DateTime.fromMillis(target, { zone }).startOf('day');
  const slots = openSlots({
    ...query,
    from: maxDate(query.from, day.toJSDate()),
    to: minDate(query.to, day.endOf('day').toJSDate()),
  });

  return slots.find((slot) => slot.startsAt.getTime() === target) ?? null;
}

/**
 * The windows a call may be held in on one day: weekly hours plus that date's
 * extra windows, merged, minus its blocks. A whole-day block empties the day.
 */
export function windowsForDay(
  weekday: number,
  rules: WeeklyWindow[],
  exceptions: DatedException[],
): Array<{ start: number; end: number }> {
  if (exceptions.some((e) => e.kind === 'BLOCK' && e.startMinute === null)) return [];

  const open = mergeWindows([
    ...rules.filter((rule) => rule.weekday === weekday).map((rule) => ({ start: rule.startMinute, end: rule.endMinute })),
    ...exceptions
      .filter((e) => e.kind === 'EXTRA' && e.startMinute !== null && e.endMinute !== null)
      .map((e) => ({ start: e.startMinute!, end: e.endMinute! })),
  ]);

  const blocks = exceptions
    .filter((e) => e.kind === 'BLOCK' && e.startMinute !== null && e.endMinute !== null)
    .map((e) => ({ start: e.startMinute!, end: e.endMinute! }));

  return blocks.reduce(subtractWindow, open);
}

/**
 * The local wall-clock time `minute` minutes after midnight on `day`, set by
 * hour and minute rather than by adding minutes to midnight — so "19:00" means
 * 19:00 even on a day a daylight-saving change makes 23 or 25 hours long.
 */
function atLocalMinute(day: DateTime, minute: number): DateTime {
  if (minute >= 1440) return day.plus({ days: 1 }).startOf('day');
  return day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 });
}

function mergeWindows(windows: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const sorted = windows.filter((w) => w.start < w.end).sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];

  for (const window of sorted) {
    const last = merged.at(-1);
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }

  return merged;
}

function subtractWindow(
  windows: Array<{ start: number; end: number }>,
  block: { start: number; end: number },
): Array<{ start: number; end: number }> {
  return windows.flatMap((window) => {
    if (block.end <= window.start || block.start >= window.end) return [window];
    const pieces: Array<{ start: number; end: number }> = [];
    if (block.start > window.start) pieces.push({ start: window.start, end: block.start });
    if (block.end < window.end) pieces.push({ start: block.end, end: window.end });
    return pieces;
  });
}

function dedupeSorted(slots: Slot[]): Slot[] {
  const seen = new Set<number>();
  return slots
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .filter((slot) => {
      const key = slot.startsAt.getTime();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

function maxDate(a: Date | undefined, b: Date): Date {
  return a && a > b ? a : b;
}

function minDate(a: Date | undefined, b: Date): Date {
  return a && a < b ? a : b;
}
