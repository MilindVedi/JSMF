"use client";

import { ChevronDown } from "lucide-react";
import { getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import { countryOptions, type PhoneValue } from "@/lib/phone";

/**
 * A mobile number with a country code picker.
 *
 * The picker is a native <select>, laid invisibly over a compact "+91" chip:
 * the chip keeps the row narrow, and the native control keeps the full country
 * list searchable by typing, accessible, and a proper wheel on phones. The
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
  // Built once and cached inside countryOptions.
  const options = countryOptions();

  return (
    <div className="field-label">
      <label htmlFor={id}>
        Mobile number
      </label>
      <div className="flex gap-2">
        <div className="group relative shrink-0">
          <span
            aria-hidden="true"
            className="field flex h-full items-center gap-1 pr-2.5 font-medium group-has-[select:focus-visible]:border-primary group-has-[select:focus-visible]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_12%,transparent)]"
          >
            {value.country} +{getCountryCallingCode(value.country)}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
          <select
            aria-label="Country code"
            value={value.country}
            onChange={(event) => onChange({ ...value, country: event.target.value as CountryCode })}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {options.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name} ({option.dialCode})
              </option>
            ))}
          </select>
        </div>
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
