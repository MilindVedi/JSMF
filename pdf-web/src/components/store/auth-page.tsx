"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { GoogleButton, GoogleMark } from "@/components/ui/google-button";
import { googleAuth } from "@/lib/api/auth";
import { isAdmin, useSessionStore } from "@/store/session-store";

const BENEFITS = [
  "Access every resource you have bought",
  "Return to your in-progress purchase",
  "One account across your library",
];

/**
 * Buyer access, Google only — and deliberately one screen rather than a
 * sign-in and a sign-up.
 *
 * There is nothing for two screens to do differently. "Continue with Google"
 * resolves to whichever the person needs: the server looks for an account
 * behind the Google identity and signs them in, or creates one and signs them
 * in. A returning buyer who picks "Create account" is not making a mistake to
 * be corrected, and a new one who picks "Sign in" is not either, so asking
 * them to choose first only invites a wrong answer to a question that has no
 * consequence.
 *
 * Google-only is a decision about email volume rather than authentication: a
 * password account needs a verification mail to prove the address and a reset
 * mail when the password is forgotten, and those two flows would be most of
 * the sending volume on a plan that allows 100 a day. Google removes both —
 * the address arrives verified, and recovery is Google's problem.
 *
 * Admins are unaffected: they are invited by an existing admin, set a password
 * when accepting, and sign in at /admin/login, which keeps its own form.
 */
function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready, restore } = useSessionStore();

  // Set when the buyer was sent here from a product page, so they land back on
  // what they were trying to buy. Absent for a plain visit.
  const requestedNext = searchParams.get("next");

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (!ready || !user) return;
    router.replace(requestedNext ?? (isAdmin(user) ? "/admin/products" : "/library"));
  }, [ready, user, requestedNext, router]);

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

        <div className="flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent">
            <GoogleMark />
          </span>
          <p>
            <span className="font-semibold text-foreground">
              One tap, and nothing to remember.
            </span>{" "}
            Your Google account is all you need — no password to set, and none to lose.
          </p>
        </div>
      </div>

      <div className="auth-card">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-primary">JSMF account</p>
          <h2 className="font-display text-2xl font-semibold text-brand-ink">
            Continue to your library
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            New here or coming back — the same button works either way.
          </p>
        </div>

        <div className="mt-7">
          <GoogleButton
            label="Continue with Google"
            onClick={() => googleAuth.start({ next: requestedNext ?? undefined })}
            className="h-12 rounded-full"
          />
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
            We only ever see your name and email address. If you have not used JSMF before,
            this creates your account.
          </p>
        </div>
      </div>
    </section>
  );
}

export function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
