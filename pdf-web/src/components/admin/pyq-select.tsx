"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Sentinel for "no value" — base-ui selects need a non-empty item value. */
export const ANY = "__any__";

/**
 * A Select over a list of `{ value, label }`, showing the label (not the slug)
 * in the trigger. `emptyLabel` adds a first item meaning "none / all".
 */
export function PyqSelect({
  value,
  onChange,
  options,
  emptyLabel,
  placeholder,
  className,
  id,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  emptyLabel?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const all = emptyLabel ? [{ value: ANY, label: emptyLabel }, ...options] : options;
  const items = Object.fromEntries(all.map((option) => [option.value, option.label]));

  return (
    <Select
      items={items}
      value={value || (emptyLabel ? ANY : "")}
      disabled={disabled}
      onValueChange={(next) => onChange(!next || next === ANY ? "" : String(next))}
    >
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {all.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
