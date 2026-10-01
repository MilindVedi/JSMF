"use client";

import { AlertTriangle, Smartphone } from "lucide-react";
import { CHANNEL_LABEL, type UndeliverableCode, type VerificationChannel } from "@/lib/api/auth";

type PhoneChannel = Exclude<VerificationChannel, "email">;

/** The number field, with the country code shown rather than typed. */
export function PhoneNumberField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  return (
    <label className="field-label" htmlFor="phone">
      Mobile number
      <span className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
          +91
        </span>
        <input
          id="phone"
          value={value}
          // Digits, spaces and a leading + only; the server normalises the
          // rest, so `+91 98765-43210` and `9876543210` both work.
          onChange={(event) => onChange(event.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16))}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className="field pl-13"
          placeholder="98765 43210"
          aria-describedby={error ? "phone-error" : undefined}
        />
      </span>
      {error && (
        <span
          id="phone-error"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * "Didn't get it?" for a phone code: a resend that waits for the server's
 * cooldown, and — when WhatsApp was used and SMS exists — the other channel.
 *
 * WhatsApp reports "this number has no WhatsApp" only *after* accepting the
 * message, so the failure this most often handles is silence. Offering SMS here
 * is the answer to that, and is why it is always visible rather than only
 * after an error.
 */
export function PhoneResend({
  channel,
  channels,
  secondsLeft,
  sending,
  onResend,
}: {
  channel: VerificationChannel;
  channels: VerificationChannel[];
  secondsLeft: number;
  sending: boolean;
  onResend: (channel: PhoneChannel) => void;
}) {
  const others = channels.filter((candidate): candidate is PhoneChannel => candidate !== channel && candidate !== "email");
  const waiting = secondsLeft > 0;

  return (
    <div className="space-y-2 text-center text-sm text-muted-foreground">
      <p>
        Didn&apos;t get it?{" "}
        {waiting ? (
          <span>You can request another in {secondsLeft}s.</span>
        ) : (
          <button
            type="button"
            disabled={sending}
            onClick={() => onResend(channel as PhoneChannel)}
            className="font-semibold text-primary hover:underline disabled:opacity-60"
          >
            {sending ? "Sending…" : `Resend on ${CHANNEL_LABEL[channel]}`}
          </button>
        )}
      </p>
      {!waiting &&
        others.map((other) => (
          <button
            key={other}
            type="button"
            disabled={sending}
            onClick={() => onResend(other)}
            className="font-semibold text-primary hover:underline disabled:opacity-60"
          >
            Send by {CHANNEL_LABEL[other]} instead
          </button>
        ))}
    </div>
  );
}

/** A failed phone send, with the same-number alternative the server offered. */
export function PhoneUndeliverable({
  failure,
  sending,
  onUse,
}: {
  failure: UndeliverableCode;
  sending: boolean;
  onUse: (channel: PhoneChannel) => void;
}) {
  const alternatives = failure.alternatives.filter(
    (channel): channel is PhoneChannel => channel !== "email",
  );

  return (
    <div className="space-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <p className="flex items-start gap-2.5 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-warning" />
        {failure.message}
      </p>
      {alternatives.map((channel) => (
        <button
          key={channel}
          type="button"
          disabled={sending}
          onClick={() => onUse(channel)}
          className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
        >
          <Smartphone className="size-4" />
          Send by {CHANNEL_LABEL[channel]} instead
        </button>
      ))}
    </div>
  );
}
