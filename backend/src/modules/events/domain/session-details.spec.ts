import { describe, expect, it } from 'vitest';
import {
  currentDetailValues,
  datesFingerprint,
  detailStatus,
  detailStatuses,
  outstandingDetails,
  valuesToRecord,
} from './session-details';

const day = (iso: string, minutes = 180) => ({ startsAt: new Date(iso), durationMinutes: minutes });

describe('datesFingerprint', () => {
  it('is the same whatever order the days come in, and null with no days', () => {
    const a = [day('2026-10-16T12:30:00Z'), day('2026-10-17T12:30:00Z')];
    expect(datesFingerprint(a)).toBe('2026-10-16T12:30:00.000Z/180,2026-10-17T12:30:00.000Z/180');
    expect(datesFingerprint([...a].reverse())).toBe(datesFingerprint(a));
    expect(datesFingerprint([])).toBeNull();
  });

  it('changes when any day moves, or only its length does', () => {
    const base = datesFingerprint([day('2026-10-16T12:30:00Z'), day('2026-10-17T12:30:00Z')]);
    expect(datesFingerprint([day('2026-10-16T12:30:00Z'), day('2026-10-17T13:30:00Z')])).not.toBe(base);
    expect(datesFingerprint([day('2026-10-16T12:30:00Z', 60), day('2026-10-17T12:30:00Z')])).not.toBe(base);
  });
});

describe('detail status', () => {
  it('reads not set, not sent, changed and up to date', () => {
    expect(detailStatus(null, undefined)).toBe('NOT_SET');
    expect(detailStatus(null, 'https://old')).toBe('NOT_SET');
    expect(detailStatus('https://a', undefined)).toBe('NOT_SENT');
    expect(detailStatus('https://b', 'https://a')).toBe('CHANGED');
    expect(detailStatus('https://a', 'https://a')).toBe('UP_TO_DATE');
  });

  it('treats going back to a link someone last received as up to date', () => {
    // They got A; the link became B, then back to A.
    expect(detailStatus('https://b', 'https://a')).toBe('CHANGED');
    expect(detailStatus('https://a', 'https://a')).toBe('UP_TO_DATE');
  });

  it('lists only what is never sent or changed, never what is unset', () => {
    const current = currentDetailValues({
      days: [day('2026-10-16T12:30:00Z')],
      joinUrl: 'https://zoom.us/j/2',
      telegramUrl: '  ',
    });
    expect(current.telegram).toBeNull();

    const statuses = detailStatuses(current, {
      dates: current.dates!,
      join_link: 'https://zoom.us/j/1',
    });
    expect(statuses).toEqual({ dates: 'UP_TO_DATE', join_link: 'CHANGED', telegram: 'NOT_SET' });
    expect(outstandingDetails(statuses)).toEqual(['join_link']);
  });

  it('records only the details the session actually has', () => {
    const current = currentDetailValues({ days: [], joinUrl: 'https://zoom.us/j/1', telegramUrl: null });
    expect(valuesToRecord(current, ['dates', 'join_link', 'telegram'])).toEqual([['join_link', 'https://zoom.us/j/1']]);
  });
});
