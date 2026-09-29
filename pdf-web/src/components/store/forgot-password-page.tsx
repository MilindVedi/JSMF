"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { storeButton } from "@/components/store/store-button";
import { VerificationCodeForm } from "@/components/store/verification-code-form";
import { UndeliverableNotice } from "@/components/store/undeliverable-notice";
import { accountApi, asUndeliverable, type UndeliverableCode } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { isAdmin, useSessionStore } from "@/store/session-store";

/**
 * Recovering an account whose password is gone.
 *
 * Three steps, each its own screen:
 *
 * 1. **Email** — ask for the address to send a code to.
 * 2. **Code** — enter the six digits. Nothing else on this screen; the person
 *    is focused on their inbox/notifications and shouldn't be distracted by
 *    password fields they can't use yet.
 * 3. **New password** — pick and confirm a replacement.
 *
 * The backend verifies the code and sets the password in one call
 * (`POST /auth/password/reset` with `{ email, code, password }`), so the code
 * is held in state between steps 2 and 3 and submitted together with the
 * password. This is purely a UX split, not an API split.
 *
 * Completing this signs the person straight in. They have just proved control
 * of the address and chosen the password; making them retype it immediately
 * would be ceremony.
 */
function ForgotPasswordForm() {
  const router = useRouter();
  const { adopt } = useSessionStore();

  // Step 1: email
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<{ expiresInMinutes: number } | null>(null);

  // Step 2: code
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Step 3: new password
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [undeliverable, setUndeliverable] = useState<UndeliverableCode | null>(null);
  const [busy, setBusy] = useState(false);

  const step: "email" | "code" | "password" =
    verifiedCode ? "password" : issued ? "code" : "email";

  async function requestCode({ resent = false } = {}) {
    if (!email.trim()) return;

    setBusy(true);
    setUndeliverable(null);

    try {
      const { expiresInMinutes } = await accountApi.forgotPassword({ email: email.trim() });
      setIssued({ expiresInMinutes });
      setCodeError(null);
      if (resent) toast.success("New code sent");
    } catch (error) {
      const failure = asUndeliverable(error);
      if (failure) {
        setUndeliverable(failure);
        return;
      }

      toast.error(error instanceof Error ? error.message : "Could not send a reset code.");
    } finally {
      setBusy(false);
    }
  }

  /** Step 2 → 3: check the code with the backend before advancing. */
  async function acceptCode(code: string) {
    setBusy(true);
    setCodeError(null);

    try {
      await accountApi.verifyResetCode({ email: email.trim(), code });
      setVerifiedCode(code);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setCodeError("That code is incorrect or has expired. Please try again.");
      } else {
        setCodeError("Could not verify the code. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  /** Step 3: submit code + password together. */
  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);

    if (password.length < 8) {
      setPasswordError("Choose a password of at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const session = await accountApi.resetPassword({
        email: email.trim(),
        code: verifiedCode!,
        password,
      });
      const account = adopt(session);
      toast.success("Password updated — you are signed in");
      router.replace(isAdmin(account) ? "/admin/products" : "/library");
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        // Code was wrong or expired — send them back to the code step so they
        // can resend rather than being stuck on a password form.
        setVerifiedCode(null);
        setCodeError("That code is incorrect or has expired. Please try again.");
      } else if (error instanceof ApiError && error.status === 409) {
        setPasswordError("That account is no longer available.");
      } else {
        setPasswordError("Could not reset the password. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const heading =
    step === "email"
      ? "Reset your password"
      : step === "code"
        ? "Check your email"
        : "Choose a new password";

  const subtitle =
    step === "email"
      ? "Tell us the address on your account and we will send a code."
      : step === "code"
        ? "Enter the 6-digit code we sent to verify it is you."
        : "Pick something you will remember. This replaces your old password.";

  return (
    <section className="auth-stage">
      <div className="auth-aside">
        <span className="eyebrow">
          <ShieldCheck className="size-3.5" />
          Account recovery
        </span>
        <h1 className="font-display text-4xl font-semibold leading-tight text-brand-ink md:text-5xl">
          Back to your library in two steps.
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          Everything you have bought stays exactly where it was. A new password does not
          change what is in your library.
        </p>
      </div>

      <div className="auth-card">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-primary">JSMF account</p>
          <h2 className="font-display text-2xl font-semibold text-brand-ink">{heading}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {/* --- Step 1: email ------------------------------------------------ */}
        {step === "email" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void requestCode();
            }}
            className="mt-7 space-y-4"
            noValidate
          >
            <label className="field-label" htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                autoComplete="username"
                className="field"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <button
              type="submit"
              className={storeButton({ className: "w-full" })}
              disabled={busy || !email.trim()}
            >
              {busy ? "Sending…" : "Send reset code"}
              {!busy && <ArrowRight className="size-4" />}
            </button>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" />
              If the address has an account, a code is on its way. We do not say either way,
              so nobody can use this page to find out who has an account.
            </p>
          </form>
        )}

        {/* --- Step 2: verification code only ------------------------------- */}
        {step === "code" && issued && (
          <VerificationCodeForm
            destination={email.trim()}
            expiresInMinutes={issued.expiresInMinutes}
            submitting={busy}
            error={codeError}
            onSubmit={acceptCode}
            onResend={() => void requestCode({ resent: true })}
            resending={busy}
          />
        )}

        {/* --- Step 3: new password + confirm ------------------------------- */}
        {step === "password" && (
          <form onSubmit={submitReset} className="mt-7 space-y-4" noValidate>
            <label className="field-label" htmlFor="new-password">
              New password
              <span className="relative block">
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="field pr-12"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </span>
            </label>

            <label className="field-label" htmlFor="confirm-password">
              Confirm password
              <span className="relative block">
                <input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  className="field pr-12"
                  placeholder="Type it again"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </span>
            </label>

            {passwordError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {passwordError}
              </p>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Resetting signs you out everywhere else, so anyone who had access loses it.
            </p>

            <button
              type="submit"
              className={storeButton({ className: "w-full" })}
              disabled={busy || !password || !confirmPassword}
            >
              {busy ? "Resetting…" : "Reset password"}
              {!busy && <ArrowRight className="size-4" />}
            </button>
          </form>
        )}

        {undeliverable && (
          <UndeliverableNotice
            failure={undeliverable}
            onRetry={() => void requestCode({ resent: true })}
            retrying={busy}
          />
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/account/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  );
}

export function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
