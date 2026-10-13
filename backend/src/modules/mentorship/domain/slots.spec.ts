import { describe, expect, it } from 'vitest';
import { findOpenSlot, openSlots, windowsForDay, type SlotQuery } from './slots';

/** IST is UTC+05:30 with no daylight saving, so expected instants are exact. */
const ist = (local: string) => new Date(`${local}+05:30`);

const offering = {
  durationMinutes: 45,
  bufferMinutes: 15,
  timezone: 'Asia/Kolkata',
  minNoticeMinutes: 0,
  bookingWindowDays: 30,
};

// Monday 2030-01-07 … the week used throughout.
const MONDAY = '2030-01-07';

function query(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    offering,
    // Monday 19:00–21:00 IST.
    rules: [{ weekday: 1, startMinute: 19 * 60, endMinute: 21 * 60 }],
    exceptions: [],
    busy: [],
    now: ist('2030-01-06T09:00:00'),
    ...overrides,
  };
}

const starts = (q: SlotQuery) => openSlots(q).map((s) => s.startsAt.toISOString());

describe('openSlots', () => {
  it('lays slots on a duration + buffer grid inside the weekly window, in IST', () => {
    const slots = openSlots(query({ offering: { ...offering, bookingWindowDays: 3 } }));
    expect(slots.map((s) => s.startsAt.getTime())).toEqual([
      ist(`${MONDAY}T19:00:00`).getTime(),
      ist(`${MONDAY}T20:00:00`).getTime(),
    ]);
    expect(slots[0].endsAt).toEqual(ist(`${MONDAY}T19:45:00`));
    expect(slots[0].blockedUntil).toEqual(ist(`${MONDAY}T20:00:00`));
  });

  it('offers a slot only if the call itself fits before the window ends', () => {
    // 19:00–20:30 fits 19:00 (ends 19:45) and not 20:00 (would end 20:45).
    const q = query({
      offering: { ...offering, bookingWindowDays: 3 },
      rules: [{ weekday: 1, startMinute: 19 * 60, endMinute: 20 * 60 + 30 }],
    });
    expect(starts(q)).toEqual([ist(`${MONDAY}T19:00:00`).toISOString()]);
  });

  it('repeats every week within the booking window', () => {
    const q = query({ offering: { ...offering, bookingWindowDays: 14 } });
    expect(openSlots(q)).toHaveLength(4); // two Mondays, two slots each
  });

  it('stops at the booking window', () => {
    const q = query({ offering: { ...offering, bookingWindowDays: 3 } });
    expect(openSlots(q)).toHaveLength(2); // only the first Monday is within 3 days
  });

  it('respects the minimum notice', () => {
    const q = query({ now: ist(`${MONDAY}T07:30:00`), offering: { ...offering, minNoticeMinutes: 12 * 60 } });
    // Earliest allowed start is 19:30 — 19:00 is too soon, 20:00 is fine.
    expect(starts(q).slice(0, 1)).toEqual([ist(`${MONDAY}T20:00:00`).toISOString()]);
  });

  it('never offers a slot in the past', () => {
    const q = query({ now: ist(`${MONDAY}T19:10:00`), offering: { ...offering, bookingWindowDays: 1 } });
    expect(starts(q)).toEqual([ist(`${MONDAY}T20:00:00`).toISOString()]);
  });

  it('removes a slot that overlaps a taken booking, including its buffer', () => {
    const busy = [{ start: ist(`${MONDAY}T19:30:00`), end: ist(`${MONDAY}T20:30:00`) }];
    // Overlaps 19:00 (blocked to 20:00) and 20:00 → both gone.
    expect(openSlots(query({ busy, offering: { ...offering, bookingWindowDays: 3 } }))).toEqual([]);
  });

  it('keeps a slot that starts exactly when a taken range ends', () => {
    const busy = [{ start: ist(`${MONDAY}T19:00:00`), end: ist(`${MONDAY}T20:00:00`) }];
    expect(starts(query({ busy, offering: { ...offering, bookingWindowDays: 3 } }))).toEqual([
      ist(`${MONDAY}T20:00:00`).toISOString(),
    ]);
  });

  it('drops the whole day for a whole-day block', () => {
    const q = query({
      offering: { ...offering, bookingWindowDays: 3 },
      exceptions: [{ date: MONDAY, kind: 'BLOCK', startMinute: null, endMinute: null }],
    });
    expect(openSlots(q)).toEqual([]);
  });

  it('drops only the blocked part of a day', () => {
    const q = query({
      offering: { ...offering, bookingWindowDays: 3 },
      exceptions: [{ date: MONDAY, kind: 'BLOCK', startMinute: 19 * 60, endMinute: 20 * 60 }],
    });
    expect(starts(q)).toEqual([ist(`${MONDAY}T20:00:00`).toISOString()]);
  });

  it('adds an extra window on a day with no weekly hours', () => {
    const q = query({
      offering: { ...offering, bookingWindowDays: 3 },
      exceptions: [{ date: '2030-01-08', kind: 'EXTRA', startMinute: 10 * 60, endMinute: 11 * 60 }],
    });
    expect(starts(q)).toContain(ist('2030-01-08T10:00:00').toISOString());
  });

  it('merges an extra window that overlaps the weekly hours without duplicating slots', () => {
    const q = query({
      offering: { ...offering, bookingWindowDays: 3 },
      exceptions: [{ date: MONDAY, kind: 'EXTRA', startMinute: 20 * 60, endMinute: 22 * 60 }],
    });
    expect(starts(q)).toEqual([
      ist(`${MONDAY}T19:00:00`).toISOString(),
      ist(`${MONDAY}T20:00:00`).toISOString(),
      ist(`${MONDAY}T21:00:00`).toISOString(),
    ]);
  });

  it('narrows to a requested range', () => {
    const q = query({ from: ist(`${MONDAY}T19:30:00`), to: ist(`${MONDAY}T23:59:00`) });
    expect(starts(q)).toEqual([ist(`${MONDAY}T20:00:00`).toISOString()]);
  });

  it('keeps wall-clock times across a daylight-saving change', () => {
    // London springs forward on Sunday 2030-03-31.
    const q: SlotQuery = {
      offering: { ...offering, timezone: 'Europe/London', bookingWindowDays: 3 },
      rules: [{ weekday: 7, startMinute: 10 * 60, endMinute: 11 * 60 }],
      exceptions: [],
      busy: [],
      now: new Date('2030-03-30T09:00:00Z'),
    };
    // 10:00 BST on that day is 09:00 UTC.
    expect(starts(q)).toEqual(['2030-03-31T09:00:00.000Z']);
  });
});

describe('findOpenSlot', () => {
  it('accepts exactly an offered start', () => {
    const slot = findOpenSlot(query(), ist(`${MONDAY}T20:00:00`));
    expect(slot?.endsAt).toEqual(ist(`${MONDAY}T20:45:00`));
  });

  it('refuses a start off the grid, even inside the window', () => {
    expect(findOpenSlot(query(), ist(`${MONDAY}T19:30:00`))).toBeNull();
    expect(findOpenSlot(query(), new Date(ist(`${MONDAY}T19:00:00`).getTime() + 1))).toBeNull();
  });

  it('refuses a taken start and an invalid date', () => {
    const busy = [{ start: ist(`${MONDAY}T19:00:00`), end: ist(`${MONDAY}T20:00:00`) }];
    expect(findOpenSlot(query({ busy }), ist(`${MONDAY}T19:00:00`))).toBeNull();
    expect(findOpenSlot(query(), new Date('not a date'))).toBeNull();
  });
});

describe('windowsForDay', () => {
  it('splits a window around a block in the middle', () => {
    const windows = windowsForDay(
      1,
      [{ weekday: 1, startMinute: 600, endMinute: 900 }],
      [{ date: MONDAY, kind: 'BLOCK', startMinute: 700, endMinute: 800 }],
    );
    expect(windows).toEqual([
      { start: 600, end: 700 },
      { start: 800, end: 900 },
    ]);
  });
});
