import { describe, expect, it } from 'vitest';
import { comparePapersNewestFirst, paperKey, parsePaperKey } from './exam-paper';

describe('exam paper keys', () => {
  it('parses a session key and a year-only key, and refuses anything else', () => {
    expect(parsePaperKey('2026-06')).toEqual({ year: 2026, month: 6 });
    expect(parsePaperKey('2026-12')).toEqual({ year: 2026, month: 12 });
    expect(parsePaperKey('2025')).toEqual({ year: 2025, month: null });
    for (const bad of ['2026-6', '2026-13', '2026-00', '26', '2026-06-01', 'june', '']) {
      expect(parsePaperKey(bad)).toBeNull();
    }
  });

  it('builds the same keys back', () => {
    expect(paperKey(2026, 6)).toBe('2026-06');
    expect(paperKey(2025, null)).toBe('2025');
  });

  it('orders newest year first, the later session first, and no month last', () => {
    const papers = [
      { year: 2025, month: null },
      { year: 2026, month: null },
      { year: 2026, month: 6 },
      { year: 2026, month: 12 },
    ];
    expect([...papers].sort(comparePapersNewestFirst)).toEqual([
      { year: 2026, month: 12 },
      { year: 2026, month: 6 },
      { year: 2026, month: null },
      { year: 2025, month: null },
    ]);
  });
});
