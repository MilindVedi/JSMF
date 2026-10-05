"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { dataSource, type PyqPlan } from "@/lib/data-source";
import { pyqKeys } from "./index";

/**
 * Subscription plans and buying one. Kept beside the other PYQ hooks; the
 * Razorpay flow is a copy of main-web's use-session-checkout (same script
 * loading, stub shortcut, retry-aware failure and dismiss handling) rather
 * than an import, because the two apps do not share code.
 */

export function usePlans() {
  return useQuery({ queryKey: ["pyq", "plans"], queryFn: () => dataSource.listPlans() });
}

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

export type PlanCheckoutOutcome =
  | { status: "paid" }
  /** The widget reported success but our confirmation call failed; the webhook will still settle it. */
  | { status: "pending-confirmation"; message: string }
  | { status: "dismissed" }
  | { status: "failed"; message: string };

/**
 * Paying for a plan. The amount is never sent: the server prices the order
 * from the product. The Razorpay webhook is what actually grants access — the
 * verify call only lets the page show success straight away. Access is
 * refetched after every outcome that may have changed it.
 */
export function usePlanCheckout() {
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const pay = useCallback(
    async (plan: PyqPlan, buyer: { name: string; email: string | null }): Promise<PlanCheckoutOutcome> => {
      setBusy(true);
      try {
        const order = await dataSource.startPlanCheckout(plan.id);

        if (order.kind === "FREE") return { status: "paid" };

        if (order.checkoutKeyId === STUB_CHECKOUT_KEY) {
          return (await dataSource.simulatePayment(order.orderId))
            ? { status: "paid" }
            : { status: "failed", message: "The payment did not go through." };
        }

        await loadCheckoutScript();
        if (!window.Razorpay) throw new Error("The payment window failed to load.");

        return await new Promise<PlanCheckoutOutcome>((resolve) => {
          // A failed attempt does not end the checkout: Razorpay keeps its
          // window open for a retry against the same order. Remembered, and
          // reported only if the buyer then closes the window without paying.
          let lastFailure: string | null = null;

          const razorpay = new window.Razorpay!({
            key: order.checkoutKeyId,
            order_id: order.providerOrderId,
            amount: Number(order.amountMinor),
            currency: order.currency,
            name: "JSMF",
            description: plan.name,
            prefill: { name: buyer.name, email: buyer.email ?? undefined },
            theme: { color: "#5b21b6" },
            handler: (response: RazorpayResponse) => {
              dataSource
                .confirmPayment({
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
                      "Your plan will be active within a few minutes.",
                  })
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
                    : { status: "dismissed" }
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
            error instanceof ApiError || error instanceof Error ? error.message : "Could not start the payment.",
        };
      } finally {
        setBusy(false);
        await queryClient.invalidateQueries({ queryKey: pyqKeys.access });
      }
    },
    [queryClient]
  );

  return { pay, busy };
}
