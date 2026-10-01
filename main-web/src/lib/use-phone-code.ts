"use client";

import { useCallback, useEffect, useState } from "react";
import {
  asRetryAfter,
  asUndeliverable,
  type PhoneCodeIssued,
  type UndeliverableCode,
  type VerificationChannel,
} from "@/lib/api/auth";

type PhoneChannel = Exclude<VerificationChannel, "email">;

/**
 * Sending a code to a phone, resending it, and switching channel — the part of
 * mobile sign-in and "add a mobile number" that is identical.
 *
 * Kept out of both screens because it is the part with the rules that matter:
 * the resend timer comes from the server (so it cannot disagree with the
 * server's cooldown), a failed send leaves the person on the number step with
 * an explanation rather than on a code screen for a code that never went, and
 * "send by SMS instead" is offered only when the server says SMS exists.
 */
export function usePhoneCode(send: (input: { phone: string; channel?: PhoneChannel }) => Promise<PhoneCodeIssued>) {
  const [phone, setPhone] = useState<string | null>(null);
  const [issued, setIssued] = useState<PhoneCodeIssued | null>(null);
  const [undeliverable, setUndeliverable] = useState<UndeliverableCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const request = useCallback(
    async (number: string, channel?: PhoneChannel): Promise<boolean> => {
      setSending(true);
      setError(null);
      setUndeliverable(null);

      try {
        const result = await send({ phone: number, channel });
        setPhone(number);
        setIssued(result);
        setSecondsLeft(result.resendAfterSeconds);
        return true;
      } catch (cause) {
        const failure = asUndeliverable(cause);
        if (failure) {
          setUndeliverable(failure);
          return false;
        }

        const wait = asRetryAfter(cause);
        if (wait !== null) {
          setSecondsLeft(wait);
          setError(cause instanceof Error ? cause.message : `Please wait ${wait} seconds.`);
          return false;
        }

        setError(cause instanceof Error ? cause.message : "Could not send a code. Please try again.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [send],
  );

  const reset = useCallback(() => {
    setPhone(null);
    setIssued(null);
    setUndeliverable(null);
    setError(null);
  }, []);

  return { phone, issued, undeliverable, error, sending, secondsLeft, request, reset };
}
