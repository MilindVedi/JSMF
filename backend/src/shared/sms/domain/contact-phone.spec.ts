import { describe, expect, it } from 'vitest';
import { normaliseContactPhone } from './contact-phone';

describe('normaliseContactPhone', () => {
  it('accepts E.164 from any country, stored without the +', () => {
    expect(normaliseContactPhone('+919876543210')).toBe('919876543210');
    expect(normaliseContactPhone('+447911123456')).toBe('447911123456');
    expect(normaliseContactPhone('+14155552671')).toBe('14155552671');
  });

  it('still accepts the bare 10-digit Indian number older pages send', () => {
    expect(normaliseContactPhone('9876543210')).toBe('919876543210');
  });

  it('refuses numbers that are invalid for their country', () => {
    expect(normaliseContactPhone('+91123')).toBeNull();
    expect(normaliseContactPhone('+910123456789')).toBeNull();
    expect(normaliseContactPhone('+4479')).toBeNull();
  });

  it('refuses anything without a country code that is not an Indian mobile', () => {
    expect(normaliseContactPhone('447911123456')).toBeNull();
    expect(normaliseContactPhone('12345')).toBeNull();
    expect(normaliseContactPhone('')).toBeNull();
  });
});
