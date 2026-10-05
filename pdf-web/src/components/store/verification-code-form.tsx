"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MailCheck, MessageCircle } from "lucide-react";
import { storeButton } from "@/components/store/store-button";
import { CHANNEL_LABEL, type VerificationChannel } from "@/lib/api/auth";
import { useSpamFolderNoteEnabled } from "@/lib/use-platform-settings";

/**
 * Entering the six digits that arrived by email.
 *
 * One input, not six boxes. The six-box pattern looks precise and behaves
 * badly: it fights password managers and OTP autofill, breaks paste on several
 * mobile browsers, and turns a backspace into a guess about which box should
 * lose a character. A single field with `inputMode="numeric"` and
 * `autocomplete="one-time-code"` lets iOS and Android offer the code straight
 * from the notification, which is the fastest path there is.
 *
 * Shared by email signup, password reset and mobile sign-in because the
 * interaction is identical — only the surrounding copy differs, and that
 * arrives as props.
 */
export function VerificationCodeForm({
  destination,
  expiresInMinutes,
  submitting,
  error,
  onSubmit,
  onResend,
  resending,
  channel = "email",
  resendSlot,
  children,
}: {
  destination: string;
  expiresInMinutes: number;
  submitting: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  resending: boolean;
  /** How the code travelled, so the message says where to look. */
  channel?: VerificationChannel;
  /** Replaces the default resend line — the mobile flow's timer and "send by SMS". */
  resendSlot?: React.ReactNode;
  /** Extra fields shown above the submit — the new password, on reset. */
  children?: React.ReactNode;
}) {
  const Icon = channel === "email" ? MailCheck : MessageCircle;
  const spamNoteEnabled = useSpamFolderNoteEnabled();
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // The code just arrived and typing it is the only thing to do on this
  // screen, so focus belongs here rather than making the person tap first.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const complete = code.length === 6;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !submitting) onSubmit(code);
      }}
      className="mt-7 space-y-4"
      noValidate
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-accent/40 p-4 text-sm">
        <Icon className="mt-0.5 size-4.5 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          We sent a 6-digit code {channel === "email" ? "" : `on ${CHANNEL_LABEL[channel]} `}to{" "}
          <span className="font-semibold text-foreground">{destination}</span>. It expires in{" "}
          {expiresInMinutes} minutes.
          {/* Only for email: a WhatsApp or SMS code has no spam folder to
              miss, and the advice would just be noise there. This is the
              single most common reason someone lands on this screen and
              says nothing arrived. */}
          {channel === "email" && spamNoteEnabled && (
            <span className="mt-1 block text-xs text-muted-foreground/80">
              Not in your inbox? Check spam or promotions — it can land there
              the first time.
            </span>
          )}
        </p>
      </div>

      <label className="field-label" htmlFor="code">
        Verification code
        <input
          id="code"
          ref={inputRef}
          value={code}
          // Digits only, capped at six: silently dropping anything else means a
          // pasted "Code: 123456" still works instead of failing validation.
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="field text-center text-lg font-semibold tracking-[0.5em] [text-indent:0.5em]"
          placeholder="000000"
          aria-describedby={error ? "code-error" : undefined}
        />
        {error && (
          <span
            id="code-error"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
          >
            {error}
          </span>
        )}
      </label>

      {children}

      <button
        type="submit"
        className={storeButton({ className: "w-full" })}
        disabled={!complete || submitting}
      >
        {submitting ? "Verifying…" : "Continue"}
        {!submitting && <ArrowRight className="size-4" />}
      </button>

      {resendSlot ?? (
      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t get it?{" "}
        <button
          type="button"
          onClick={onResend}
          disabled={resending}
          className="font-semibold text-primary hover:underline disabled:opacity-60"
        >
          {resending ? "Sending…" : "Send a new code"}
        </button>
      </p>
      )}
    </form>
  );
}
