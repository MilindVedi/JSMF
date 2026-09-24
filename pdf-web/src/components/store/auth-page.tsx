"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { GoogleButton } from "@/components/ui/google-button";
import { storeButton } from "@/components/store/store-button";
import { googleAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { isAdmin, useSessionStore } from "@/store/session-store";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

const signupSchema = z.object({
  name: z.string().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email address"),
  // Matches the server's minimum. A longer passphrase is the single most
  // effective thing a person can do here, so the hint says so rather than
  // demanding symbols nobody remembers.
  password: z.string().min(12, "Use at least 12 characters — a memorable phrase works best."),
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

const BENEFITS = [
  "Access every resource you have bought",
  "Return to your in-progress purchase",
  "One account across your library",
];

function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, ready, restore } = useSessionStore();
  const [showPassword, setShowPassword] = useState(false);

  // Set when the buyer was sent here from a product page, so they land back on
  // what they were trying to buy. Absent for a plain visit.
  const requestedNext = searchParams.get("next");

  /**
   * An explicit `next` always wins — it is why the person was sent here. With
   * no explicit destination the landing place depends on who signed in: an
   * admin has no purchases, so defaulting them to an empty buyer library looks
   * exactly like the admin panel having disappeared.
   */
  function destinationFor(account: AuthUser | null): string {
    if (requestedNext) return requestedNext;
    return isAdmin(account) ? "/admin/products" : "/library";
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues | LoginValues>({
    resolver: zodResolver(signup ? signupSchema : loginSchema),
  });

  // `errors` is typed against the union, so the name field is only present in
  // signup mode; this keeps the reads below honest without casting the form.
  const fieldErrors = errors as Partial<Record<"name" | "email" | "password", { message?: string }>>;

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (!ready || !user) return;
    router.replace(requestedNext ?? (isAdmin(user) ? "/admin/products" : "/library"));
  }, [ready, user, requestedNext, router]);

  async function onSubmit(values: SignupValues | LoginValues) {
    try {
      if (signup) {
        const { name, email, password } = values as SignupValues;
        const { storeApi } = await import("@/lib/api/store");
        await storeApi.register({ name, email, password });

        // Registering returns tokens, but logging in through the session store
        // is what puts them where the rest of the app looks for them — and it
        // keeps exactly one code path responsible for starting a session.
        const account = await login(email, password);
        toast.success("Account created");
        router.replace(destinationFor(account));
        return;
      }

      const account = await login(values.email, values.password);
      toast.success("Signed in");
      router.replace(destinationFor(account));
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 409
          ? "An account with that email already exists."
          : error instanceof ApiError && error.status === 401
            ? "Incorrect email or password."
            : error instanceof Error
              ? error.message
              : signup
                ? "Could not create the account."
                : "Could not sign in.",
      );
    }
  }

  return (
    <section className="auth-stage">
      <div className="auth-aside">
        <span className="eyebrow">
          <ShieldCheck className="size-3.5" />
          Secure access
        </span>
        <h1 className="font-display text-4xl font-semibold leading-tight text-brand-ink md:text-5xl">
          Your study desk, exactly as you left it.
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          Keep purchased resources, focused revision, and your next milestone together.
        </p>
        <div className="space-y-3 text-sm text-foreground">
          {BENEFITS.map((benefit) => (
            <p key={benefit} className="flex items-center gap-2">
              <CheckCircle2 className="size-4.5 shrink-0 text-success" />
              {benefit}
            </p>
          ))}
        </div>
      </div>

      <div className="auth-card">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-primary">JSMF account</p>
          <h2 className="font-display text-2xl font-semibold text-brand-ink">
            {signup ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {signup
              ? "Start building your personal revision library."
              : "Sign in to access everything you have bought."}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
          {signup && (
            <label className="field-label" htmlFor="name">
              Name
              <input
                id="name"
                autoComplete="name"
                className="field"
                placeholder="Your full name"
                {...register("name" as keyof SignupValues)}
              />
              {fieldErrors.name && (
                <span className="text-xs font-medium text-destructive">
                  {fieldErrors.name.message}
                </span>
              )}
            </label>
          )}

          <label className="field-label" htmlFor="email">
            Email
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="field"
              placeholder="you@example.com"
              {...register("email")}
            />
            {fieldErrors.email && (
              <span className="text-xs font-medium text-destructive">
                {fieldErrors.email.message}
              </span>
            )}
          </label>

          <label className="field-label" htmlFor="password">
            Password
            <span className="relative block">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                className="field pr-12"
                placeholder={signup ? "At least 12 characters" : "Your password"}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
              </button>
            </span>
            {fieldErrors.password && (
              <span className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {fieldErrors.password.message}
              </span>
            )}
          </label>

          {signup && !fieldErrors.password && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              A memorable phrase beats a short, complicated password.
            </p>
          )}

          <button type="submit" className={storeButton({ className: "w-full" })} disabled={isSubmitting}>
            {isSubmitting
              ? signup
                ? "Creating account…"
                : "Signing in…"
              : signup
                ? "Create account"
                : "Sign in"}
            {!isSubmitting && <ArrowRight className="size-4" />}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <GoogleButton
          label={signup ? "Sign up with Google" : "Continue with Google"}
          onClick={() => googleAuth.start({ next: requestedNext ?? undefined })}
          className="h-11 rounded-full"
        />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {signup ? "Already have an account?" : "New here?"}{" "}
          <Link
            href={`/account/${signup ? "login" : "signup"}?next=${encodeURIComponent(
              requestedNext ?? "/library",
            )}`}
            className="font-semibold text-primary hover:underline"
          >
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </section>
  );
}

/**
 * Sign in and Create account, which are the same screen with different copy,
 * one extra field and a different submit — exactly as the design draws them.
 */
export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  return (
    <Suspense fallback={null}>
      <AuthForm mode={mode} />
    </Suspense>
  );
}
