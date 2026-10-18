import { describe, expect, it } from 'vitest';
import { sessionDisplayName } from './session-display';

describe('sessionDisplayName', () => {
  const product = { title: 'Day 2 starts tonight! Join the 4-day session' };

  it('uses the short name when there is one', () => {
    expect(sessionDisplayName({ shortName: 'NEET-PG Revision Bootcamp', product })).toBe('NEET-PG Revision Bootcamp');
  });

  it('falls back to the title when it is empty or blank', () => {
    expect(sessionDisplayName({ shortName: null, product })).toBe(product.title);
    expect(sessionDisplayName({ shortName: '   ', product })).toBe(product.title);
  });
});
