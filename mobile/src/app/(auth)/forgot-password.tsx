import { useState } from "react";
import { View } from "react-native";
import { Link, useRouter } from "expo-router";
import { MailCheck } from "lucide-react-native";
import { authApi } from "@jsmf/core/api";
import { forgotPasswordSchema } from "@jsmf/core/schemas";
import { AuthShell, fieldErrors, FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const parsed = forgotPasswordSchema.safeParse({ email: email.trim() });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return;
    setSubmitting(true);
    try {
      await authApi.forgotPassword({ email: parsed.data.email });
      setSent(parsed.data.email);
    } catch (error) {
      setErrors({ root: error instanceof Error ? error.message : "Could not send the code." });
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email">
        <View className="items-center gap-3 py-2">
          <View className="size-11 items-center justify-center rounded-full bg-success">
            <MailCheck size={20} color={colors["success-foreground"]} />
          </View>
          <Txt className="text-center text-sm text-muted-foreground">
            If an account exists for <Txt weight={600} className="text-sm">{sent}</Txt>, a password reset code has been sent.
          </Txt>
          <Button label="Enter the code" onPress={() => router.push({ pathname: "/reset-password", params: { email: sent } })} />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send you a reset code."
      footer={
        <Link href="/sign-in">
          <Txt weight={700} className="text-sm text-primary">
            Back to sign in
          </Txt>
        </Link>
      }
    >
      <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} onSubmitEditing={submit} />
      <FormError message={errors.root} />
      <Button label="Send reset code" size="lg" loading={submitting} onPress={submit} />
    </AuthShell>
  );
}
