"use client";

import { getCountryCallingCode } from "libphonenumber-js";
import { CountryCodePicker } from "@/components/store/country-code-picker";
import type { PhoneValue } from "@/lib/phone";

/**
 * A mobile number with a country code picker.
 *
 * The country code is a searchable list (CountryCodePicker); the
 * number itself is plain digits: formatting it while typing fights the caret
 * (deleting a space would delete nothing), and the API validates it anyway.
 *
 * Kept in step with main-web/src/components/phone-field.tsx.
 */
export function PhoneField({
  id,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="field-label">
      <label htmlFor={id}>
        Mobile number
      </label>
      <div className="flex gap-2">
        <CountryCodePicker value={value.country} onChange={(country) => onChange({ ...value, country })} />
        <input
          id={id}
          className="field min-w-0"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value.national}
          // Digits only, capped at E.164's fifteen. A pasted "+44 7911 123456"
          // keeps working: a leading country code matching the picker is dropped.
          onChange={(event) => {
            let digits = event.target.value.replace(/\D/g, "");
            const code = getCountryCallingCode(value.country);
            if (event.target.value.trim().startsWith("+") && digits.startsWith(code)) digits = digits.slice(code.length);
            onChange({ ...value, national: digits.slice(0, 15) });
          }}
          placeholder="Enter your mobile number"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
      </div>
      {hint && (
        <span id={`${id}-hint`} className="text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
