import { describe, expect, it } from 'vitest';
import { bundlePayableMinor } from './bundle-price';

describe('bundlePayableMinor', () => {
  it('charges the full price when nothing is held', () => {
    expect(bundlePayableMinor(19900n, 5, 0)).toBe(19900n);
  });

  it('charges only for the PDFs not held, rounded to the rupee', () => {
    expect(bundlePayableMinor(19900n, 5, 2)).toBe(11900n); // 119.4
    expect(bundlePayableMinor(19900n, 2, 1)).toBe(10000n); // 99.5 rounds up
    expect(bundlePayableMinor(30000n, 3, 1)).toBe(20000n);
  });

  it('is zero when every PDF is held', () => {
    expect(bundlePayableMinor(19900n, 4, 4)).toBe(0n);
  });

  it('never goes below zero or above the price for odd counts', () => {
    expect(bundlePayableMinor(19900n, 3, 7)).toBe(0n);
    expect(bundlePayableMinor(19900n, 3, -1)).toBe(19900n);
    expect(bundlePayableMinor(19900n, 0, 0)).toBe(19900n);
  });
});
