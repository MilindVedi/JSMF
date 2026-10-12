import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { minPasswordLength, resetPasswordSchema } from "@jsmf/core/schemas";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "@/lib/toast";
import { AuthShell, fieldErrors, FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";

const schema = resetPasswordSchema({ api: true });
const MIN_PASSWORD = minPasswordLength({ api: true });

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const [values, setValues] = useState({ email: params.email ?? "", code: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof typeof values) => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  async function submit() {
    const parsed = schema.safeParse({ ...values, email: values.email.trim() });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return;
    setSubmitting(true);
    try {
      await resetPassword({ email: parsed.data.email ?? "", code: parsed.data.code ?? "", password: parsed.data.password });
      toast.success("Password updated — you're signed in.");
    } catch (error) {
      setErrors({ root: error instanceof Error ? error.message : "Could not reset your password." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Set a new password" description="Choose a new password for your JSMF account.">
      <Field label="Email" value={values.email} onChangeText={set("email")} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" error={errors.email} />
      <Field label="Reset code" value={values.code} onChangeText={set("code")} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" error={errors.code} />
      <PasswordField label="New password" value={values.password} onChangeText={set("password")} placeholder={`At least ${MIN_PASSWORD} characters`} autoComplete="new-password" error={errors.password} />
      <PasswordField label="Confirm new password" value={values.confirmPassword} onChangeText={set("confirmPassword")} placeholder="Type it again" autoComplete="new-password" error={errors.confirmPassword} />
      <FormError message={errors.root} />
      <Button label="Update password" size="lg" loading={submitting} onPress={submit} />
    </AuthShell>
  );
}
