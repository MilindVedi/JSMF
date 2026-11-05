"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { storeButton } from "@/components/ui/store-button";
import { accountApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useSessionStore } from "@/store/session-store";

const schema = z
  .object({
    // Matches the server's floor. A longer passphrase is the single most
    // effective thing a person can do here, so the hint says so rather than
    // demanding symbols nobody remembers.
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Use at least 8 characters — a memorable phrase works best."),
    confirmPassword: z.string().min(1, "Type the new password again"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FieldKey = keyof z.infer<typeof schema>;

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

const LABELS: Record<FieldKey, string> = {
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm new password",
};

/**
 * Changing the signed-in account's own password.
 *
 * Lives behind a sign-in rather than on the sign-in screen because only the
 * account's owner may do this — the current password is what proves that, and
 * an unauthenticated form could not ask for it meaningfully. The
 * reset-by-email flow covers the other case, where the password is lost.
 *
 * The twin of pdf-web's admin ChangePasswordCard; this one is written in the
 * main site's own field styling rather than the admin panel's components.
 */
export function ChangePasswordCard() {
  const { adopt } = useSessionStore();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [shown, setShown] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: FieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as FieldKey] = issue.message;
      setErrors(next);
      return;
    }

    setBusy(true);
    try {
      const session = await accountApi.changePassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      // The change revoked every session, including this one. Adopting the
      // fresh pair is what keeps this tab signed in rather than being logged
      // out moments later by its own success.
      adopt(session);
      setForm(EMPTY);
      toast.success("Your password has been changed");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setErrors({ currentPassword: "That is not your current password" });
      } else {
        toast.error("Your password could not be changed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">Password</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Changing it signs you out everywhere else, on every JSMF site.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        {(Object.keys(LABELS) as FieldKey[]).map((key) => (
          <label key={key} className="field-label" htmlFor={key}>
            {LABELS[key]}
            <span className="relative block">
              <input
                id={key}
                type={shown[key] ? "text" : "password"}
                autoComplete={key === "currentPassword" ? "current-password" : "new-password"}
                className="field pr-11"
                value={form[key]}
                onChange={(event) => set(key, event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShown((current) => ({ ...current, [key]: !current[key] }))}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
                aria-label={shown[key] ? `Hide ${LABELS[key].toLowerCase()}` : `Show ${LABELS[key].toLowerCase()}`}
              >
                {shown[key] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
            {errors[key] && <span className="text-xs font-medium text-destructive">{errors[key]}</span>}
          </label>
        ))}

        <button type="submit" className={storeButton({ className: "w-full sm:w-auto" })} disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </section>
  );
}
