import { View } from "react-native";
import { Link } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { Txt } from "@/components/ui/text";
import { AuthShell, FormError, GoogleSignIn } from "./auth-shell";
import type { SignInForm } from "./sign-in-form";

/**
 * The sign-in screen's first look — the plain auth card the other auth
 * screens still use. Kept so it can be switched back to (see sign-in.tsx).
 */
export function SignInClassic({ email, setEmail, password, setPassword, errors, submitting, submit }: SignInForm) {
  return (
    <AuthShell
      // The first screen a new install opens on, so nothing that assumes they've been here.
      title="Sign in to JSMF"
      description="Your practice, progress and revision, on the web and on this phone."
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
