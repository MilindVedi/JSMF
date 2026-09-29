import { describe, expect, it } from 'vitest';
import {
  InvalidPhoneNumberError,
  formatPhoneNumber,
  maskPhoneNumber,
  normalisePhoneNumber,
} from './phone-number';

/**
 * The claim under test is narrow and load-bearing: **every way a person can
 * write their own number produces one identical string.**
 *
 * It matters because that string is destined to be a unique key on an account.
 * If `+91 98765 43210` and `09876543210` both reach the database unchanged,
 * one person has two accounts, and the purchases on the second cannot be moved
 * to the first without a human adjudicating. That failure appears months after
 * the mistake, in support, not in a stack trace — which is why it is pinned
 * down here instead.
 */

const INDIA = { defaultCountryCode: '91' };

describe('phone number normalisation', () => {
  it('reduces every way of writing one number to the same string', () => {
    const written = [
      '9876543210',
      '09876543210',
      '+919876543210',
      '+91 98765 43210',
      '+91-98765-43210',
      '0091 9876543210',
      '919876543210',
      '  +91 (98765) 43210  ',
    ];

    const normalised = new Set(written.map((input) => normalisePhoneNumber(input, INDIA)));

    // One entry, or the uniqueness constraint is a lie.
    expect([...normalised]).toEqual(['919876543210']);
  });

  it('keeps a number that happens to start with the country code intact', () => {
    // `9186543210` is a real Indian mobile. Reading its leading `91` as the
    // country code would leave eight digits and reject a valid number — the
    // kind of bug that only shows up for a minority of users.
    expect(normalisePhoneNumber('9186543210', INDIA)).toBe('919186543210');
    expect(normalisePhoneNumber('+919186543210', INDIA)).toBe('919186543210');
  });

  describe('rejects what could not receive a code', () => {
    it.each([
      ['', 'nothing at all'],
      ['abcdefghij', 'no digits'],
      ['98765', 'too short'],
      ['98765432101234', 'too long'],
      ['1234567890', 'not a mobile series'],
      ['5876543210', 'below the 6–9 mobile range'],
    ])('%s (%s)', (input) => {
      // Rejecting at the form is the point. An unroutable number accepted here
      // fails silently at the provider, and the person sits waiting for a code
      // that was never going anywhere.
      expect(() => normalisePhoneNumber(input, INDIA)).toThrow(InvalidPhoneNumberError);
    });
  });

  it('accepts the whole valid Indian mobile range', () => {
    for (const first of ['6', '7', '8', '9']) {
      expect(normalisePhoneNumber(`${first}876543210`, INDIA)).toBe(`91${first}876543210`);
    }
  });

  it('applies whichever country code is configured', () => {
    // The India rule is the only country-specific one, and it must not leak
    // into a market that has not been added yet.
    expect(normalisePhoneNumber('+1 415 555 0132', { defaultCountryCode: '1' })).toBe(
      '14155550132',
    );
  });
});

describe('displaying a number', () => {
  it('adds back the + for the owner', () => {
    expect(formatPhoneNumber('919876543210')).toBe('+919876543210');
  });

  it('masks all but the last four for anyone else', () => {
    // Shown on "we sent a code to…", which is visible to whoever asked — not
    // necessarily the account holder. Four digits is enough for the real owner
    // to recognise their number and not enough for a stranger to learn it.
    const masked = maskPhoneNumber('919876543210');

    expect(masked).toBe('+********3210');
    expect(masked).not.toContain('98765');
  });
});
