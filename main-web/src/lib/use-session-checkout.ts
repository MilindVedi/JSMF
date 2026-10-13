"use client";

import { useCallback, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { sessionsApi } from "@/lib/api/sessions";
import type { RegistrationAnswers } from "@/lib/api/types";
import { completeCheckout, type CheckoutOutcome } from "@/lib/razorpay-checkout";

export type { CheckoutOutcome } from "@/lib/razorpay-checkout";

/**
 * Paying for a seat. The amount is never sent: the server prices the order
 * from the session, so a tampered page has nothing to change. The Razorpay
 * webhook is what actually grants the seat — the verify call here only lets
 * the page show success straight away. The payment window itself is shared
 * with the one-to-one booking (lib/razorpay-checkout.ts).
 */
export function useSessionCheckout() {
  const [busy, setBusy] = useState(false);

  const pay = useCallback(
    async (
      session: { id: string; title: string },
      answers: RegistrationAnswers,
      buyer: { name: string; email: string | null },
    ): Promise<CheckoutOutcome> => {
      setBusy(true);
      try {
        const order = await sessionsApi.register(session.id, answers);
        return await completeCheckout(order, {
          description: session.title,
          buyer: { ...buyer, contact: answers.whatsappNumber },
          pendingMessage:
            "Your payment went through but we could not confirm it here. " +
            "Your seat will be confirmed by email within a few minutes.",
        });
      } catch (error) {
        return {
          status: "failed",
          message:
            error instanceof ApiError || error instanceof Error
              ? error.message
              : "Could not start the payment.",
        };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { pay, busy };
}
