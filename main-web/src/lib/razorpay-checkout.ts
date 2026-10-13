"use client";

import { track } from "@/lib/analytics";
import { api } from "@/lib/api/client";
import type { CheckoutResult } from "@/lib/api/types";

/**
 * Taking a payment for an order the server has already created and priced.
 * Shared by everything the main website sells — a seat, a one-to-one call — so
 * the Razorpay widget, its quirks and its analytics live in one place.
 *
 * The amount is never sent from here: it comes back from the server inside
 * `order`. The Razorpay webhook is what actually settles the purchase; the
 * verify call only lets the page show success straight away.
 */

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

export type CheckoutOutcome =
  | { status: "paid" }
  /** The widget reported success but our confirmation call failed; the webhook will still settle it. */
  | { status: "pending-confirmation"; message: string }
  | { status: "dismissed" }
  | { status: "failed"; message: string };

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

const verifyPayment = (payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
  api.post<{ orderId: string; status: string }>("/payments/verify", payload);

/** Development only: settles a PAYMENT_DRIVER=stub order. The API answers 404 otherwise. */
const simulatePayment = (orderId: string) =>
  api.post<{ success: boolean }>(`/orders/${orderId}/simulate-payment`, { outcome: "success" });

/**
 * Opens the payment window for `order` and resolves with how it ended. Throws
 * only if the window cannot be loaded at all; callers turn that into "failed".
 */
export async function completeCheckout(
  order: CheckoutResult,
  options: {
    /** Shown in the Razorpay window under "JSMF". */
    description: string;
    buyer: { name: string; email: string | null; contact?: string };
    /** What to say when the payment went through but could not be confirmed here. */
    pendingMessage: string;
  },
): Promise<CheckoutOutcome> {
  if (order.kind === "FREE") {
    track("payment_success", { kind: "free" });
    return { status: "paid" };
  }

  if (order.checkoutKeyId === STUB_CHECKOUT_KEY) {
    track("checkout_open", { kind: "stub" });
    const result = await simulatePayment(order.orderId);
    track(result.success ? "payment_success" : "payment_error", { kind: "stub" });
    return result.success ? { status: "paid" } : { status: "failed", message: "The payment did not go through." };
  }

  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error("The payment window failed to load.");

  return new Promise<CheckoutOutcome>((resolve) => {
    // A failed attempt does not end the checkout. Razorpay keeps its window
    // open and lets the buyer retry with another card or UPI — against the
    // same order — so resolving "failed" here would leave the page saying
    // "payment did not go through" while the buyer goes on to pay successfully
    // underneath it. Remembered instead, and reported only if they then close
    // the window without a successful payment.
    let lastFailure: string | null = null;

    const razorpay = new window.Razorpay!({
      key: order.checkoutKeyId,
      order_id: order.providerOrderId,
      amount: Number(order.amountMinor),
      currency: order.currency,
      name: "JSMF",
      description: options.description,
      prefill: {
        name: options.buyer.name,
        email: options.buyer.email ?? undefined,
        contact: options.buyer.contact,
      },
      theme: { color: "#5b21b6" },
      handler: (response: RazorpayResponse) => {
        track("payment_success");
        verifyPayment({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        })
          .then(() => resolve({ status: "paid" }))
          .catch(() => resolve({ status: "pending-confirmation", message: options.pendingMessage }));
      },
      modal: {
        ondismiss: () => {
          track("checkout_dismiss", { afterFailure: Boolean(lastFailure) });
          resolve(
            lastFailure
              ? {
                  status: "failed",
                  message: `${lastFailure} You can try again. If your bank shows a debit, it is reversed automatically.`,
                }
              : { status: "dismissed" },
          );
        },
      },
    });

    razorpay.on("payment.failed", (payload) => {
      track("payment_error");
      lastFailure = payload.error?.description ?? "The payment did not go through.";
    });

    razorpay.open();
    track("checkout_open");
  });
}
