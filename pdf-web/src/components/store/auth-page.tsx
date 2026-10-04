"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { GoogleButton } from "@/components/ui/google-button";
import { storeButton } from "@/components/store/store-button";
import { VerificationCodeForm } from "@/components/store/verification-code-form";
import { ProfileForm } from "@/components/store/profile-form";
import { UndeliverableNotice } from "@/components/store/undeliverable-notice";
import {
  accountApi,
  asUndeliverable,
  googleAuth,
  methodsApi,
  type UndeliverableCode,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { isAdmin, useSessionStore } from "@/store/session-store";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

// Name, mobile and the rest are asked after the code, on the profile step —
// this first screen is only what the account needs to exist.
const signupSchema = z
  .object({
    email: z.email("Enter a valid email address"),
    // Matches the server's minimum. A longer passphrase is the single most
    // effective thing a person can do here, so the hint says so rather than
    // demanding symbols nobody remembers.
    password: z.string().min(8, "Use at least 8 characters — a memorable phrase works best."),
    confirmPassword: z.string().min(1, "Type your password again"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

const LOGIN_CONTENT = {
  eyebrow: "Secure access",
  title: "Your study desk, exactly as you left it.",
  description: "Keep purchased resources, focused revision, and your next milestone together.",
  benefits: [
    "Access every resource you have bought",
    "Return to your in-progress purchase",
    "One account across your library",
  ],
};

const SIGNUP_CONTENT = {
  eyebrow: "Start your preparation",
  title: "Your entire study desk, in one place.",
  description: "Create an account to keep your notes, formula sheets, and revision milestones organized.",
  benefits: [
    "Instant access to high-yield study resources",
    "Study seamlessly across all your devices",
    "One secure account for your entire library",
  ],
};

function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, ready, restore, adopt, updateUser } = useSessionStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // Step three. Set as a ref as well as state: the code step signs the person
  // in, and the "already signed in, move along" effect must not whisk them
  // away before the profile step has rendered.
  const [completingProfile, setCompletingProfile] = useState(false);
  const completingProfileRef = useRef(false);

  /**
   * Signup is two steps now: the details, then the code that proves the
   * address. `pending` holds what was submitted so the code step can resend
   * without asking for it again — and, crucially, so the password is typed
   * once rather than carried back through a second form.
   */
  const [pending, setPending] = useState<SignupValues | null>(null);
  const [issued, setIssued] = useState<{ expiresInMinutes: number } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [undeliverable, setUndeliverable] = useState<UndeliverableCode | null>(null);
  const [busy, setBusy] = useState(false);
  // False until the server answers, so the mobile button never flashes in
  // on a deployment where it is off.
  const [phoneEnabled, setPhoneEnabled] = useState(false);

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
  const fieldErrors = errors as Partial<
    Record<"email" | "password" | "confirmPassword", { message?: string }>
  >;

  useEffect(() => {
    void restore();
    void methodsApi.get().then((methods) => setPhoneEnabled(methods.phone.enabled));
  }, [restore]);

  useEffect(() => {
    if (!ready || !user || completingProfileRef.current) return;
    router.replace(requestedNext ?? (isAdmin(user) ? "/admin/products" : "/library"));
  }, [ready, user, requestedNext, router]);

  /**
   * Sends (or resends) the signup code. Shared by the first submit and the
   * "send a new code" link, because they differ only in what triggered them —
   * and a resend must supersede the previous code, which the server handles.
   */
  // The code step is shown once a code has actually been issued, never merely
  // because the form was submitted — a failed send must not strand someone on
  // a screen asking for a code that was never sent.
  const awaitingCode = signup && Boolean(pending && issued);

  async function requestCode(values: SignupValues, { resent = false } = {}) {
    setBusy(true);
    setUndeliverable(null);

    try {
      // The confirmation stays in the browser; only one copy of the password
      // ever leaves it.
      const { expiresInMinutes } = await accountApi.startSignup({
        email: values.email,
        password: values.password,
      });
      setPending(values);
      setIssued({ expiresInMinutes });
      setCodeError(null);
      if (resent) toast.success("New code sent");
    } catch (error) {
      // The one failure with a route out: the code exists and is still valid,
      // the message simply could not be carried. The server says what else the
      // person can do, so this screen never has to guess.
      const failure = asUndeliverable(error);
      if (failure) {
        setUndeliverable(failure);
        // Stay on the details step: there is no code to type.
        return;
      }

      toast.error(
        error instanceof ApiError && error.status === 409
          ? "An account with that email already exists."
          : error instanceof Error
            ? error.message
            : "Could not start signup.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Step two: the code becomes the account, and the session starts here. */
  async function submitCode(code: string) {
    if (!pending) return;

    setBusy(true);
    setCodeError(null);

    try {
      const session = await accountApi.verifySignup({ email: pending.email, code });
      // `adopt` puts the tokens where the rest of the app looks for them,
      // keeping one code path responsible for starting a session.
      completingProfileRef.current = true;
      setCompletingProfile(true);
      adopt(session);
    } catch (error) {
      // Inline rather than a toast: the mistake is in the field the person is
      // looking at, and a toast would vanish before they retyped it.
      setCodeError(
        error instanceof ApiError && error.status === 400
          ? "That code is incorrect or has expired."
          : error instanceof ApiError && error.status === 409
            ? "An account with that email already exists."
            : "Could not verify that code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(values: SignupValues | LoginValues) {
    if (signup) {
      await requestCode(values as SignupValues);
      return;
    }

    try {
      const account = await login(values.email, values.password);
      toast.success("Signed in");
      router.replace(destinationFor(account));
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 401
          ? "Incorrect email or password."
          : error instanceof Error
            ? error.message
            : "Could not sign in.",
      );
    }
  }

  return (
    <section className="auth-stage">
      {(() => {
        const content = signup ? SIGNUP_CONTENT : LOGIN_CONTENT;
        return (
          <div className="auth-aside">
            <span className="eyebrow">
              <ShieldCheck className="size-3.5" />
              {content.eyebrow}
            </span>
            <h1 className="font-display text-4xl font-semibold leading-tight text-brand-ink md:text-5xl">
              {content.title}
            </h1>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground">
              {content.description}
            </p>
            <div className="space-y-3 text-sm text-foreground">
              {content.benefits.map((benefit) => (
                <p key={benefit} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4.5 shrink-0 text-success" />
                  {benefit}
                </p>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="auth-card">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-primary">JSMF account</p>
          <h2 className="font-display text-2xl font-semibold text-brand-ink">
            {completingProfile
              ? "Tell us about yourself"
              : awaitingCode
                ? "Check your email"
                : signup
                  ? "Create your account"
                  : "Welcome back"}
          </h2>
          {/* Only the code and profile steps carry a subheading — signup and
              login headings stand on their own, matching jsmf.me. */}
          {completingProfile ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Your email is verified. One last step to finish your account.
            </p>
          ) : awaitingCode && (
            <p className="mt-2 text-sm text-muted-foreground">
              One last step — confirm the address so nobody else can use it.
            </p>
          )}
        </div>

        {/* Google leads: no password to create or remember, and it is what
            most buyers already use elsewhere. Email stays fully available
            below it — never hidden — for anyone who would rather not use
            Google, or does not have an account. Not shown on the code step:
            that screen has one job. */}
        {!awaitingCode && !completingProfile && (
          <div className="mt-7">
            {/* Mirrors jsmf.me's auth page: the "RECOMMENDED" badge nudges a
                new account toward Google, where there is no password to
                invent in the first place. Returning sign-ins already know
                which account they have, so no badge there — the Google
                button sits on its own. */}
            <div className={signup ? "relative rounded-2xl bg-accent px-4 pb-4 pt-6" : ""}>
              {signup && (
                <span className="absolute left-1/2 top-0 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                  <Sparkles size={11} /> Recommended
                </span>
              )}
              <GoogleButton
                label={signup ? "Sign up with Google" : "Continue with Google"}
                onClick={() => googleAuth.start({ next: requestedNext ?? undefined })}
                className="h-12 w-full text-[15px] shadow-sm"
              />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                One tap — no password. Fastest sign in / sign up.
              </p>
            </div>

            <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or continue with email
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        {/* The code step replaces the details form rather than appearing below
            it: the details are already submitted, and leaving them editable
            would invite changing the address the code was just sent to. */}
        {completingProfile ? (
          <ProfileForm
            onSaved={(saved) => {
              updateUser(saved);
              toast.success("Account created");
              router.replace(destinationFor(saved));
            }}
          />
        ) : awaitingCode && pending && issued ? (
          <>
            <VerificationCodeForm
              destination={pending.email}
              expiresInMinutes={issued.expiresInMinutes}
              submitting={busy}
              error={codeError}
              onSubmit={submitCode}
              onResend={() => void requestCode(pending, { resent: true })}
              resending={busy}
            />
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setIssued(null);
                setCodeError(null);
              }}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Use a different email address
            </button>
          </>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
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
                placeholder={signup ? "At least 8 characters" : "Your password"}
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

          {signup && (
            <label className="field-label" htmlFor="confirmPassword">
              Confirm password
              <span className="relative block">
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  className="field pr-12"
                  placeholder="Type it again"
                  {...register("confirmPassword" as keyof SignupValues)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((shown) => !shown)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </span>
              {fieldErrors.confirmPassword && (
                <span className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  {fieldErrors.confirmPassword.message}
                </span>
              )}
            </label>
          )}

          {signup && !fieldErrors.password && !fieldErrors.confirmPassword && (
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
        )}

        {/* Sits outside the branch: the failure happens while sending the code,
            so it has to be visible on the details step it kept the person on. */}
        {undeliverable && (
          <UndeliverableNotice
            failure={undeliverable}
            onRetry={() => pending && void requestCode(pending, { resent: true })}
            retrying={busy}
          />
        )}

        {/* Rendered only when the server reports mobile sign-in as on, so
            switching it on is a server setting and never a redeploy. */}
        {phoneEnabled && !completingProfile && (
          <Link
            href={`/account/mobile?next=${encodeURIComponent(requestedNext ?? "/library")}`}
            className={storeButton({ variant: "secondary", className: "mt-3 w-full" })}
          >
            <Smartphone className="size-4" />
            Continue with mobile number
          </Link>
        )}

        {!signup && (
          <p className="mt-5 text-center text-sm">
            <Link
              href="/account/forgot-password"
              className="font-semibold text-primary hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        )}

        {!completingProfile && (
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
        )}
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
