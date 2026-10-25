import { describe, expect, it } from 'vitest';
import { parseByteRange } from './local-storage.controller';

/** The local driver answers byte ranges as GCS does, so the reader cannot tell them apart. */
describe('parseByteRange', () => {
  const size = 500;

  it('reads one range in its three forms, clamped to the file', () => {
    expect(parseByteRange('bytes=0-99', size)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=400-', size)).toEqual({ start: 400, end: 499 });
    expect(parseByteRange('bytes=-100', size)).toEqual({ start: 400, end: 499 });
    expect(parseByteRange('bytes=450-9999', size)).toEqual({ start: 450, end: 499 });
    expect(parseByteRange('bytes=-9999', size)).toEqual({ start: 0, end: 499 });
  });

  it('calls a range past the end unsatisfiable (416)', () => {
    expect(parseByteRange('bytes=500-', size)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=1000-1200', size)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', size)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=0-', 0)).toBe('unsatisfiable');
  });

  it('serves the whole file for anything else', () => {
    expect(parseByteRange(undefined, size)).toBeNull();
    expect(parseByteRange('bytes=-', size)).toBeNull();
    expect(parseByteRange('bytes=0-10,20-30', size)).toBeNull();
    expect(parseByteRange('bytes=300-100', size)).toBeNull();
    expect(parseByteRange('items=0-10', size)).toBeNull();
  });
});
