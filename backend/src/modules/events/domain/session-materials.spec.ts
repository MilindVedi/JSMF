import { describe, expect, it } from 'vitest';
import { desiredAccess, entitledToDay } from './session-materials';

const at = (iso: string) => new Date(iso);
const day1 = { startsAt: at('2026-10-15T20:30:00Z'), durationMinutes: 120 }; // ends 22:30
const day2 = { startsAt: at('2026-10-16T18:30:00Z'), durationMinutes: 120 }; // ends 20:30

describe('session materials rule', () => {
  it('gives every day to someone who paid before the session, whatever the setting', () => {
    const before = at('2026-10-10T10:00:00Z');
    expect(entitledToDay(day1, before, false)).toBe(true);
    expect(entitledToDay(day2, before, false)).toBe(true);
  });

  it('counts the day in progress as theirs', () => {
    expect(entitledToDay(day1, at('2026-10-15T21:00:00Z'), false)).toBe(true);
  });

  it('withholds a finished day only when late joiners do not get earlier days', () => {
    const late = at('2026-10-16T10:00:00Z');
    expect(entitledToDay(day1, late, false)).toBe(false);
    expect(entitledToDay(day1, late, true)).toBe(true);
    expect(entitledToDay(day2, late, false)).toBe(true);
  });

  it('counts a product attached to two days once, due if either day is', () => {
    const holders = [{ userId: 'u', joinedAt: at('2026-10-16T10:00:00Z') }];
    const access = desiredAccess(
      holders,
      [
        { productId: 'p', day: day1 },
        { productId: 'p', day: day2 },
        { productId: 'q', day: day1 },
      ],
      false,
    );
    expect([...access.get('u')!.productIds]).toEqual(['p']);
  });
});
