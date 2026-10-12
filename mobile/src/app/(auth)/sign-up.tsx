import { useState } from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { minPasswordLength, signupSchema } from "@jsmf/core/schemas";
import { useTaxonomy } from "@jsmf/core/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "@/lib/toast";
import { AuthShell, fieldErrors, FormError, GoogleSignIn } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { Chip } from "@/components/ui/primitives";
import { Txt } from "@/components/ui/text";

const schema = signupSchema({ api: true });
const MIN_PASSWORD = minPasswordLength({ api: true });

export default function SignUpScreen() {
  const signup = useAuthStore((s) => s.signup);
  // Every exam in the bank (the public, cached taxonomy) — the same choice as web.
  const taxonomy = useTaxonomy();
  const exams = taxonomy.data?.exams ?? [];
  const requiresChoice = exams.length > 1;
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [targetExamId, setTargetExamId] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof typeof values) => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  async function submit() {
    const parsed = schema.safeParse({ ...values, name: values.name.trim(), email: values.email.trim(), targetExamId });
    const next = fieldErrors(parsed);
    if (requiresChoice && !targetExamId) next.targetExamId = "Select which exam you're preparing for";
    setErrors(next);
    if (!parsed.success || next.targetExamId) return;
    setSubmitting(true);
    try {
      await signup({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        targetExamId: targetExamId ?? exams[0]?.id ?? "neet-pg",
      });
      toast.success("Account created — welcome to JSMF!");
    } catch (error) {
      setErrors({ root: error instanceof Error ? error.message : "Could not create your account." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description="One JSMF account for PYQ practice, explanations and revision."
      footer={
        <Txt className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in">
            <Txt weight={700} className="text-sm text-primary">
              Sign in
            </Txt>
          </Link>
        </Txt>
      }
    >
      <GoogleSignIn mode="signup" />
      <Field label="Full name" value={values.name} onChangeText={set("name")} placeholder="Ananya Rao" autoComplete="name" textContentType="name" error={errors.name} />
      <Field
        label="Email"
        value={values.email}
        onChangeText={set("email")}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        error={errors.email}
      />
      <PasswordField label="Password" value={values.password} onChangeText={set("password")} placeholder={`At least ${MIN_PASSWORD} characters`} autoComplete="new-password" textContentType="newPassword" error={errors.password} />
      <PasswordField label="Confirm password" value={values.confirmPassword} onChangeText={set("confirmPassword")} placeholder="Type it again" autoComplete="new-password" textContentType="newPassword" error={errors.confirmPassword} />
      {requiresChoice ? (
        <View className="gap-2">
          <Txt weight={700} className="text-[13px]">
            Which exam are you preparing for? <Txt className="text-destructive">*</Txt>
          </Txt>
          <View className="flex-row gap-2">
            {exams.map((exam) => (
              <Chip key={exam.id} label={exam.shortName} selected={targetExamId === exam.id} onPress={() => setTargetExamId(exam.id)} className="flex-1 justify-center" />
            ))}
          </View>
          {errors.targetExamId ? <Txt className="text-xs text-destructive">{errors.targetExamId}</Txt> : null}
        </View>
      ) : null}
      <FormError message={errors.root} />
      <Button label={submitting ? "Creating account…" : "Create account"} iconRight={submitting ? undefined : ArrowRight} size="lg" loading={submitting} onPress={submit} />
    </AuthShell>
  );
}
