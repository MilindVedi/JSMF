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
 * Two steps, the same shape as signup and deliberately so: ask for the
 * address, then exchange a code. The new password is chosen on the *second*
 * step, with the code, rather than the first — choosing it before proving the
 * address would mean typing a password that a stranger's request could have
 * triggered, and it keeps the two halves of the proof in one submission.
 *
 * Completing this signs the person straight in. They have just proved control
 * of the address and chosen the password; making them retype it immediately
 * would be ceremony.
 */
function ForgotPasswordForm() {
  const router = useRouter();
  const { adopt } = useSessionStore();

  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<{ expiresInMinutes: number } | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [undeliverable, setUndeliverable] = useState<UndeliverableCode | null>(null);
  const [busy, setBusy] = useState(false);

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
        // The one case where the person is genuinely stuck: they cannot sign in
        // and the way back cannot be delivered. The notice carries whatever
        // routes remain, which is why it is worth saying rather than a generic
        // error.
        setUndeliverable(failure);
        return;
      }

      toast.error(error instanceof Error ? error.message : "Could not send a reset code.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(code: string) {
    if (password.length < 8) {
      setCodeError("Choose a password of at least 8 characters.");
      return;
    }

    setBusy(true);
    setCodeError(null);

    try {
      const session = await accountApi.resetPassword({ email: email.trim(), code, password });
      const account = adopt(session);
      toast.success("Password updated — you are signed in");
      router.replace(isAdmin(account) ? "/admin/products" : "/library");
    } catch (error) {
      setCodeError(
        error instanceof ApiError && error.status === 400
          ? "That code is incorrect or has expired."
          : error instanceof ApiError && error.status === 409
            ? "That account is no longer available."
            : "Could not reset the password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

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
          <h2 className="font-display text-2xl font-semibold text-brand-ink">
            {issued ? "Choose a new password" : "Reset your password"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {issued
              ? "Enter the code we sent, then pick a password you will remember."
              : "Tell us the address on your account and we will send a code."}
          </p>
        </div>

        {issued ? (
          <VerificationCodeForm
            destination={email.trim()}
            expiresInMinutes={issued.expiresInMinutes}
            submitting={busy}
            error={codeError}
            onSubmit={submitReset}
            onResend={() => void requestCode({ resent: true })}
            resending={busy}
          >
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
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Resetting signs you out everywhere else, so anyone who had access loses it.
            </p>
          </VerificationCodeForm>
        ) : (
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
