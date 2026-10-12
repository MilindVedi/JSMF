import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * A contact number as a form holds it: the chosen country and the national
 * digits typed after it. Sent to the API as E.164 (`+919876543210`), which the
 * backend validates against the same libphonenumber rules.
 *
 * Kept in step with pdf-web/src/lib/phone.ts — identity is platform-wide.
 */
export interface PhoneValue {
  country: CountryCode;
  /** Digits only, no country code. */
  national: string;
}

export const DEFAULT_COUNTRY: CountryCode = "IN";
export const EMPTY_PHONE: PhoneValue = { country: DEFAULT_COUNTRY, national: "" };

export interface CountryOption {
  code: CountryCode;
  name: string;
  dialCode: string;
}

let cachedCountries: CountryOption[] | null = null;

/** Every country libphonenumber knows, India first, the rest by name. */
export function countryOptions(): CountryOption[] {
  if (cachedCountries) return cachedCountries;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const all = getCountries().map((code) => ({
    code,
    name: names.of(code) ?? code,
    dialCode: `+${getCountryCallingCode(code)}`,
  }));
  all.sort((a, b) => a.name.localeCompare(b.name));
  const india = all.findIndex((option) => option.code === DEFAULT_COUNTRY);
  if (india > 0) all.unshift(...all.splice(india, 1));
  cachedCountries = all;
  return all;
}

/** Validates a required number: its E.164 form, or an error to show. */
export function validatePhone(value: PhoneValue): { e164: string | null; error?: string } {
  if (!value.national) return { e164: null, error: "Enter your mobile number" };
  const parsed = parsePhoneNumberFromString(value.national, value.country);
  if (!parsed?.isValid()) return { e164: null, error: "Enter a valid mobile number for the selected country" };
  return { e164: parsed.number };
}

/**
 * Back into a form value from what the API stores — E.164 digits with or
 * without the `+` (`919876543210`). Anything unreadable leaves the field blank
 * on the default country rather than prefilling something wrong.
 */
export function phoneFromStored(stored: string | null | undefined): PhoneValue {
  if (!stored) return EMPTY_PHONE;
  const parsed = parsePhoneNumberFromString(stored.startsWith("+") ? stored : `+${stored}`);
  if (!parsed?.country) return EMPTY_PHONE;
  return { country: parsed.country, national: parsed.nationalNumber };
}
