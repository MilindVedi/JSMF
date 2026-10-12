import { registerDecorator, type ValidationOptions } from 'class-validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * A contact number someone typed into a form — the profile's mobile number, a
 * session registration's WhatsApp number. Never a sign-in key (that is
 * `normalisePhoneNumber`), so any country is fine; it only has to be a real,
 * dialable number for that country.
 *
 * Accepted in two spellings:
 * - E.164 with a `+`, `+447911123456` — what the forms send now that they have
 *   a country picker;
 * - a bare 10-digit Indian mobile, `9876543210` — what forms sent before the
 *   picker, kept so a browser still running the old page keeps working.
 *
 * Validated with libphonenumber's full metadata, so a number of the wrong
 * length or an unassigned range for its country is refused here rather than
 * stored and never reachable.
 */
const LEGACY_INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** E.164 digits without the `+` — `919876543210` — or null if it is not a valid number. */
export function normaliseContactPhone(raw: string): string | null {
  const value = raw.trim();
  if (LEGACY_INDIAN_MOBILE.test(value)) return `91${value}`;
  if (!value.startsWith('+')) return null;

  const parsed = parsePhoneNumberFromString(value);
  if (!parsed?.isValid()) return null;
  return parsed.number.slice(1);
}

/** `@IsContactPhone()` — the class-validator form of `normaliseContactPhone`. */
export function IsContactPhone(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isContactPhone',
      target: target.constructor,
      propertyName,
      options: { message: 'Enter a valid mobile number for the selected country', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && normaliseContactPhone(value) !== null,
      },
    });
}
