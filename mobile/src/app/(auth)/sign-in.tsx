import { useState } from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { loginSchema } from "@jsmf/core/schemas";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "@/lib/toast";
import { AuthShell, fieldErrors, FormError, GoogleSignIn } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { Txt } from "@/components/ui/text";

const schema = loginSchema({ api: true });

export default function SignInScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const parsed = schema.safeParse({ email: email.trim(), password });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return;
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      toast.success("Welcome back!");
    } catch (error) {
      setErrors({ root: error instanceof Error ? error.message : "Could not log in." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Your practice, progress and revision queue — right where you left them."
      footer={
        <Txt className="text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/sign-up">
            <Txt weight={700} className="text-sm text-primary">
              Create an account
            </Txt>
          </Link>
        </Txt>
      }
    >
      <GoogleSignIn />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        error={errors.email}
      />
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
        error={errors.password}
      />
      <FormError message={errors.root} />
      <Button label={submitting ? "Signing in…" : "Sign in"} iconRight={submitting ? undefined : ArrowRight} size="lg" loading={submitting} onPress={submit} />
      <View className="items-center">
        <Link href="/forgot-password">
          <Txt weight={700} className="text-sm text-primary">
            Forgot your password?
          </Txt>
        </Link>
      </View>
    </AuthShell>
  );
}
