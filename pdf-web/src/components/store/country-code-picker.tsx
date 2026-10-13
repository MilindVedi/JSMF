"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { countryOptions, type CountryOption } from "@/lib/phone";

/**
 * The country-code button beside a phone number: a compact "IN +91" chip
 * that opens a searchable list. Search matches the country name ("united"),
 * its two-letter code ("ae") or its calling code ("971", "+44").
 *
 * Built on Base UI's Combobox, so keyboard use, screen-reader announcements
 * and focus handling come from a maintained library rather than custom code.
 *
 * Kept in step with main-web/src/components/country-code-picker.tsx.
 */
export function CountryCodePicker({
  value,
  onChange,
}: {
  value: CountryCode;
  onChange: (country: CountryCode) => void;
}) {
  // Built once and cached inside countryOptions.
  const options = countryOptions();
  const selected = options.find((option) => option.code === value) ?? options[0];

  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(option) => option && onChange(option.code)}
      itemToStringLabel={(option) => option.name}
      isItemEqualToValue={(a, b) => a.code === b.code}
      filter={matches}
    >
      <Combobox.Trigger
        aria-label={`Country code: ${selected.name} ${selected.dialCode}`}
        className="field flex h-full w-auto shrink-0 cursor-pointer items-center gap-1.5 pr-2.5 font-medium data-[popup-open]:border-primary data-[popup-open]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_12%,transparent)]"
      >
        <span className="text-xs font-bold text-muted-foreground">{selected.code}</span>
        {selected.dialCode}
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform [[data-popup-open]_&]:rotate-180" />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={6} className="z-[200] outline-none">
          <Combobox.Popup className="w-[min(20rem,calc(100vw-2rem))] origin-[var(--transform-origin)] overflow-hidden rounded-2xl border border-border bg-card text-sm shadow-editorial transition-[transform,opacity] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              {/* text-base below md: iOS zooms the page into inputs under 16px. */}
              <Combobox.Input
                placeholder="Search country or code"
                className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_12%,transparent)] md:text-sm"
              />
            </div>
            <Combobox.Empty className="px-4 py-6 text-center text-sm text-muted-foreground empty:hidden">
              No country matches that.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto overscroll-contain p-1.5 empty:hidden">
              {(option: CountryOption) => (
                <Combobox.Item
                  key={option.code}
                  value={option}
                  className="flex cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-foreground outline-none data-[highlighted]:bg-accent data-[selected]:font-semibold data-[selected]:text-primary"
                >
                  <span className="w-6 shrink-0 text-xs font-bold text-muted-foreground">{option.code}</span>
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{option.dialCode}</span>
                  <Combobox.ItemIndicator className="shrink-0 text-primary">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/** Name contains the query, or it is the two-letter code, or the calling code starts with its digits. */
function matches(option: CountryOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits && /^\+?[\d\s-]+$/.test(q)) return option.dialCode.slice(1).startsWith(digits);
  return option.name.toLowerCase().includes(q) || option.code.toLowerCase() === q;
}
