"use client";

import { useCallback, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { sessionsApi } from "@/lib/api/sessions";
import type { RegistrationAnswers } from "@/lib/api/types";

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** What the stub payment driver returns as its key — never a real Razorpay key. */
const STUB_CHECKOUT_KEY = "stub_key_id";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment window. Check your connection."));
    document.body.appendChild(script);
  });
}

export type CheckoutOutcome =
  | { status: "paid" }
  /** The widget reported success but our confirmation call failed; the webhook will still settle it. */
  | { status: "pending-confirmation"; message: string }
  | { status: "dismissed" }
  | { status: "failed"; message: string };

/**
 * Paying for a seat. The amount is never sent: the server prices the order
 * from the session, so a tampered page has nothing to change. The Razorpay
 * webhook is what actually grants the seat — the verify call here only lets
 * the page show success straight away.
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

        if (order.kind === "FREE") return { status: "paid" };

        if (order.checkoutKeyId === STUB_CHECKOUT_KEY) {
          const result = await sessionsApi.simulatePayment(order.orderId);
          return result.success
            ? { status: "paid" }
            : { status: "failed", message: "The payment did not go through." };
        }

        await loadCheckoutScript();
        if (!window.Razorpay) throw new Error("The payment window failed to load.");

        return await new Promise<CheckoutOutcome>((resolve) => {
          // A failed attempt does not end the checkout. Razorpay keeps its
          // window open and lets the buyer retry with another card or UPI —
          // against the same order — so resolving "failed" here would leave the
          // dialog saying "payment did not go through" while the buyer goes on
          // to pay successfully underneath it. Remembered instead, and reported
          // only if they then close the window without a successful payment.
          let lastFailure: string | null = null;

          const razorpay = new window.Razorpay!({
            key: order.checkoutKeyId,
            order_id: order.providerOrderId,
            amount: Number(order.amountMinor),
            currency: order.currency,
            name: "JSMF",
            description: session.title,
            prefill: {
              name: buyer.name,
              email: buyer.email ?? undefined,
              contact: answers.whatsappNumber,
            },
            theme: { color: "#5b21b6" },
            handler: (response: RazorpayResponse) => {
              sessionsApi
                .verifyPayment({
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                })
                .then(() => resolve({ status: "paid" }))
                .catch(() =>
                  resolve({
                    status: "pending-confirmation",
                    message:
                      "Your payment went through but we could not confirm it here. " +
                      "Your seat will be confirmed by email within a few minutes.",
                  }),
                );
            },
            modal: {
              ondismiss: () =>
                resolve(
                  lastFailure
                    ? {
                        status: "failed",
                        message: `${lastFailure} You can try again. If your bank shows a debit, it is reversed automatically.`,
                      }
                    : { status: "dismissed" },
                ),
            },
          });

          razorpay.on("payment.failed", (payload) => {
            lastFailure = payload.error?.description ?? "The payment did not go through.";
          });

          razorpay.open();
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
