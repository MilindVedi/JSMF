"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { z } from "zod";
import { PhoneField } from "@/components/phone-field";
import { storeButton } from "@/components/ui/store-button";
import { accountApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { EMPTY_PHONE, validatePhone, type PhoneValue } from "@/lib/phone";

/** Fallbacks if the options request fails; the API validates against its own list either way. */
const DEFAULT_EXAMS = ["NEET-PG", "INI-CET", "FMGE"];
const DEFAULT_STAGES = ["1st / 2nd year", "3rd year", "Final year", "Intern"];

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  preparingFor: z.string().min(1, "Choose the exam you're preparing for"),
  currentStage: z.string().min(1, "Select where you are right now"),
});

type Values = z.infer<typeof schema>;
// The mobile number is validated apart from the schema, by libphonenumber (validatePhone).
type FieldKey = keyof Values | "mobileNumber";

/**
 * The last signup step: the same questions a seat registration asks, asked
 * once here so the account already knows them.
 *
 * Kept in step with pdf-web/src/components/store/profile-form.tsx — identity
 * is platform-wide.
 */
export function ProfileForm({ onSaved }: { onSaved: (user: AuthUser) => void }) {
  const [form, setForm] = useState<Values>({ name: "", preparingFor: "", currentStage: "" });
  const [phone, setPhone] = useState<PhoneValue>(EMPTY_PHONE);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState({ exams: DEFAULT_EXAMS, stages: DEFAULT_STAGES });

  useEffect(() => {
    accountApi
      .profileOptions()
      .then(setOptions)
      .catch(() => undefined);
  }, []);

  const set = (key: keyof Values, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const parsed = schema.safeParse(form);
    const checkedPhone = validatePhone(phone);
    if (!parsed.success || checkedPhone.error) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error?.issues ?? []) next[issue.path[0] as FieldKey] = issue.message;
      if (checkedPhone.error) next.mobileNumber = checkedPhone.error;
      setErrors(next);
      return;
    }

    setBusy(true);
    try {
      onSaved(await accountApi.updateProfile({ ...parsed.data, mobileNumber: checkedPhone.e164! }));
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.status === 400
          ? "Please check your details and try again."
          : "Could not save your details. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
      <label className="field-label" htmlFor="name">
        Name
        <input
          id="name"
          autoComplete="name"
          className="field"
          placeholder="Your full name"
          value={form.name}
          onChange={(event) => set("name", event.target.value)}
        />
        {errors.name && <span className="text-xs font-medium text-destructive">{errors.name}</span>}
      </label>

      <PhoneField
        id="mobileNumber"
        value={phone}
        onChange={(value) => {
          setPhone(value);
          setErrors((current) => ({ ...current, mobileNumber: "" }));
        }}
        error={errors.mobileNumber}
      />

      <ChipGroup
        label="Preparing for"
        values={options.exams}
        selected={form.preparingFor}
        onSelect={(value) => set("preparingFor", value)}
        error={errors.preparingFor}
      />
      <ChipGroup
        label="Current stage"
        values={options.stages}
        selected={form.currentStage}
        onSelect={(value) => set("currentStage", value)}
        error={errors.currentStage}
      />

      {failure && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{failure}</p>
      )}

      <button type="submit" className={storeButton({ className: "w-full" })} disabled={busy}>
        {busy ? "Saving…" : "Finish"}
        {!busy && <ArrowRight className="size-4" />}
      </button>
    </form>
  );
}

function ChipGroup({
  label,
  values,
  selected,
  onSelect,
  error,
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="field-label" role="group" aria-label={label}>
      {label}
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={selected === value}
            onClick={() => onSelect(value)}
            className={`filter-chip ${selected === value ? "filter-chip-active" : ""}`}
          >
            {value}
          </button>
        ))}
      </div>
      {error && <span className="text-xs font-medium text-destructive">{error}</span>}
    </div>
  );
}
