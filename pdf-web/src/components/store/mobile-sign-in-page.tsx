"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Loader2, Smartphone } from "lucide-react";
import { storeButton } from "@/components/store/store-button";
import { VerificationCodeForm } from "@/components/store/verification-code-form";
import {
  PhoneNumberField,
  PhoneResend,
  PhoneUndeliverable,
} from "@/components/store/phone-code-controls";
import { methodsApi, phoneApi, type AuthMethods } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { usePhoneCode } from "@/lib/use-phone-code";
import { isAdmin, useSessionStore } from "@/store/session-store";

/**
 * Continue with a mobile number — sign-in and sign-up in one flow.
 *
 * Three steps: the number, the code, and — only for a number with no account
 * — a name. The screen never says "no account found" before the code comes
 * back, because that would make the number field a lookup tool.
 *
 * Reachable only when the server reports mobile sign-in as enabled. The route
 * still exists when it is off (someone may type the URL), and says so plainly
 * instead of offering a form whose every submit would 404.
 */
function MobileSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next");
  const { user, ready, restore, adopt } = useSessionStore();

  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [number, setNumber] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [registration, setRegistration] = useState<{ token: string } | null>(null);
  const [name, setName] = useState("");
  const [registering, setRegistering] = useState(false);

  const code = usePhoneCode(phoneApi.start);

  useEffect(() => {
    void restore();
    void methodsApi.get().then(setMethods);
  }, [restore]);

  useEffect(() => {
    if (ready && user) router.replace(destinationFor(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the session settles
  }, [ready, user]);

  function destinationFor(account: AuthUser | null): string {
    if (requestedNext) return requestedNext;
    return isAdmin(account) ? "/admin/products" : "/library";
  }

  async function verify(entered: string) {
    if (!code.phone) return;
    setVerifying(true);
    setCodeError(null);

    try {
      const result = await phoneApi.verify({ phone: code.phone, code: entered });
      if (result.status === "signed-in") {
        const account = adopt(result);
        toast.success("Signed in");
        router.replace(destinationFor(account));
        return;
      }
      setRegistration({ token: result.registrationToken });
    } catch (error) {
      setCodeError(
        error instanceof ApiError && error.status === 400
          ? "That code is incorrect or has expired."
          : error instanceof ApiError && error.status === 403
            ? "This account is not available. Please contact support."
            : "Could not verify that code. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (!code.phone || !registration || name.trim().length < 2) return;
    setRegistering(true);

    try {
      const session = await phoneApi.register({
        phone: code.phone,
        registrationToken: registration.token,
        name: name.trim(),
      });
      const account = adopt(session);
      toast.success("Account created");
      router.replace(destinationFor(account));
    } catch (error) {
      // The token is single-use and short-lived; the honest recovery is to
      // start again with a fresh code.
      toast.error(
        error instanceof ApiError && error.status === 400
          ? "That took too long. Please verify your number again."
          : "Could not create your account. Please try again.",
      );
      setRegistration(null);
      code.reset();
    } finally {
      setRegistering(false);
    }
  }

  if (!methods) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const step = registration ? "name" : code.issued ? "code" : "number";

  return (
    <section className="auth-stage">
      <div className="auth-aside">
        <span className="eyebrow">
          <Smartphone className="size-3.5" />
          Mobile sign-in
        </span>
        <h1 className="font-display text-4xl font-semibold leading-tight text-brand-ink md:text-5xl">
          No password to remember.
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          We send a one-time code to your phone each time you sign in. New here? The same code
          creates your account.
        </p>
      </div>

      <div className="auth-card">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-primary">JSMF account</p>
          <h2 className="font-display text-2xl font-semibold text-brand-ink">
            {step === "name" ? "One last thing" : step === "code" ? "Enter your code" : "Continue with mobile"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === "name"
              ? "Your number is verified. What should we call you?"
              : step === "code"
                ? "It confirms this number is yours."
                : "Sign in or create an account with your mobile number."}
          </p>
        </div>

        {!methods.phone.enabled ? (
          <div className="mt-7 space-y-4 text-sm text-muted-foreground">
            <p>Signing in with a mobile number isn&apos;t available yet.</p>
            <Link href="/account/login" className={storeButton({ className: "w-full" })}>
              Sign in another way
            </Link>
          </div>
        ) : step === "number" ? (
          <form
            className="mt-7 space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (number.replace(/\D/g, "").length >= 10) void code.request(number);
            }}
          >
            <PhoneNumberField value={number} onChange={setNumber} error={code.error} />
            {code.undeliverable && (
              <PhoneUndeliverable
                failure={code.undeliverable}
                sending={code.sending}
                onUse={(channel) => void code.request(number, channel)}
              />
            )}
            <button
              type="submit"
              className={storeButton({ className: "w-full" })}
              disabled={code.sending || number.replace(/\D/g, "").length < 10}
            >
              {code.sending ? "Sending code…" : "Send code"}
              {!code.sending && <ArrowRight className="size-4" />}
            </button>
          </form>
        ) : step === "code" && code.issued ? (
          <>
            <VerificationCodeForm
              destination={code.issued.destination}
              expiresInMinutes={code.issued.expiresInMinutes}
              channel={code.issued.channel}
              submitting={verifying}
              error={codeError}
              onSubmit={verify}
              onResend={() => undefined}
              resending={code.sending}
              resendSlot={
                <>
                  {code.undeliverable && (
                    <PhoneUndeliverable
                      failure={code.undeliverable}
                      sending={code.sending}
                      onUse={(channel) => code.phone && void code.request(code.phone, channel)}
                    />
                  )}
                  {code.error && (
                    <p className="text-center text-xs font-medium text-destructive">{code.error}</p>
                  )}
                  <PhoneResend
                    channel={code.issued.channel}
                    channels={methods.phone.channels}
                    secondsLeft={code.secondsLeft}
                    sending={code.sending}
                    onResend={(channel) => code.phone && void code.request(code.phone, channel)}
                  />
                </>
              }
            />
            <button
              type="button"
              onClick={code.reset}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Use a different number
            </button>
          </>
        ) : (
          <form className="mt-7 space-y-4" noValidate onSubmit={register}>
            <label className="field-label" htmlFor="name">
              Name
              <input
                id="name"
                autoFocus
                autoComplete="name"
                className="field"
                placeholder="Your full name"
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 120))}
              />
            </label>
            <button
              type="submit"
              className={storeButton({ className: "w-full" })}
              disabled={registering || name.trim().length < 2}
            >
              {registering ? "Creating account…" : "Create account"}
              {!registering && <ArrowRight className="size-4" />}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Prefer email?{" "}
          <Link
            href={`/account/login?next=${encodeURIComponent(requestedNext ?? "/library")}`}
            className="font-semibold text-primary hover:underline"
          >
            Sign in with email or Google
          </Link>
        </p>
      </div>
    </section>
  );
}

export function MobileSignInPage() {
  return (
    <Suspense fallback={null}>
      <MobileSignIn />
    </Suspense>
  );
}
