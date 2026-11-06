import { useState } from "react";
import { loginSchema } from "@jsmf/core/schemas";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "@/lib/toast";
import { fieldErrors } from "./auth-shell";

const schema = loginSchema({ api: true });

/**
 * The email sign-in form's state and submit, shared by every look of the
 * sign-in screen. Navigation after success is the router guard's job: once
 * the store says signed-in, the auth stack is no longer reachable.
 */
export function useSignInForm() {
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

  return { email, setEmail, password, setPassword, errors, submitting, submit };
}

export type SignInForm = ReturnType<typeof useSignInForm>;
