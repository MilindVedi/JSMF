"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/**
 * Changing the signed-in admin's own password.
 *
 * Lives here rather than on the sign-in screen because changing a password is
 * something only the account's owner may do — the current password is what
 * proves that, and an unauthenticated form could not ask for it meaningfully.
 * The reset-by-email flow covers the other case, where the password is lost.
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
      // fresh pair is what keeps the admin signed in rather than bounced to
      // the login screen a moment later.
      adopt(session);
      setForm(EMPTY);
      setShown({});
      toast.success("Password changed. Other sessions have been signed out.");
    } catch (error) {
      // 401 is specifically "wrong current password", so it belongs on that
      // field rather than in a toast that vanishes before it can be retyped.
      if (error instanceof ApiError && error.status === 401) {
        setErrors({ currentPassword: "Your current password is incorrect" });
      } else {
        toast.error(
          error instanceof Error ? error.message : "Could not change the password",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="max-w-sm space-y-4" noValidate>
          <PasswordField
            id="currentPassword"
            label="Current password"
            value={form.currentPassword}
            autoComplete="current-password"
            shown={Boolean(shown.currentPassword)}
            onToggle={() => setShown((s) => ({ ...s, currentPassword: !s.currentPassword }))}
            onChange={(value) => set("currentPassword", value)}
            error={errors.currentPassword}
          />
          <PasswordField
            id="newPassword"
            label="New password"
            value={form.newPassword}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            shown={Boolean(shown.newPassword)}
            onToggle={() => setShown((s) => ({ ...s, newPassword: !s.newPassword }))}
            onChange={(value) => set("newPassword", value)}
            error={errors.newPassword}
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm new password"
            value={form.confirmPassword}
            autoComplete="new-password"
            placeholder="Type it again"
            shown={Boolean(shown.confirmPassword)}
            onToggle={() => setShown((s) => ({ ...s, confirmPassword: !s.confirmPassword }))}
            onChange={(value) => set("confirmPassword", value)}
            error={errors.confirmPassword}
          />

          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Changing…" : "Change password"}
          </Button>

          <p className="text-xs text-muted-foreground">
            Changing your password signs out every other device. You stay signed in here.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordField({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  shown,
  onToggle,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  autoComplete: string;
  shown: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="pr-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
