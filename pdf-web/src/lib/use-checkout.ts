"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { storeApi } from "@/lib/api/store";

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/**
 * What `StubPaymentAdapter.createOrder` always hands back as `checkoutKeyId`
 * — never a real Razorpay key, so it doubles as the signal that the API is
 * running `PAYMENT_DRIVER=stub`. Loading the real widget against a stub order
 * id is not a degraded fallback, it is an immediate failure: Razorpay's own
 * script asks its servers about that order and gets nothing back, so the
 * buyer sees "Payment Failed" before they have done anything at all.
 */
const STUB_CHECKOUT_KEY = "stub_key_id";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { email?: string; name?: string };
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/** Loaded once, on first use — not in the document head of every page. */
function loadCheckoutScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load checkout")));
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

/**
 * Buying a product, from either side of the free/paid split.
 *
 * The amount is never sent — the server prices the order from the product row,
 * so there is nothing here for a tampered client to inflate or discount. The
 * signature returned by the widget is verified server-side before anything is
 * unlocked; this hook only decides what the buyer sees next.
 */
export function useCheckout(options: { onSettled?: () => void } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const buy = useCallback(
    async (productId: string, productTitle: string, buyer?: { email?: string; name?: string }) => {
      setBusy(true);

      try {
        const result = await storeApi.checkout(productId);

        if (result.kind === "FREE") {
          toast.success("Added to your library");
          options.onSettled?.();
          router.push("/library");
          return;
        }

        if (result.checkoutKeyId === STUB_CHECKOUT_KEY) {
          try {
            const outcome = await storeApi.simulatePayment(result.orderId);
            if (!outcome.success) {
              toast.error("The payment did not go through.");
              return;
            }
            toast.success("Payment successful", {
              description: "Simulated by PAYMENT_DRIVER=stub — no real charge was made.",
            });
            options.onSettled?.();
            router.push("/library");
          } catch (error) {
            toast.error(
              error instanceof ApiError ? error.message : "Could not simulate the payment",
            );
          } finally {
            setBusy(false);
          }
          return;
        }

        await loadCheckoutScript();

        if (!window.Razorpay) throw new Error("Checkout failed to load");

        const razorpay = new window.Razorpay({
          key: result.checkoutKeyId,
          order_id: result.providerOrderId,
          // Razorpay wants paise as a number; our amount is a string of paise
          // precisely so it survives transport without float rounding.
          amount: Number(result.amountMinor),
          currency: result.currency,
          name: "JSMF",
          description: productTitle,
          prefill: { email: buyer?.email, name: buyer?.name },
          handler: (response) => {
            // Confirms the payment promptly for the UI. The webhook is the
            // real authority and will settle this order even if the tab is
            // closed right now — both paths are idempotent server-side.
            void (async () => {
              try {
                await storeApi.verifyPayment({
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                });
                toast.success("Payment successful");
                options.onSettled?.();
                router.push("/library");
              } catch (error) {
                // The money may well have been taken — the webhook will still
                // grant access — so this must not read as "payment failed".
                toast.error(
                  error instanceof ApiError
                    ? error.message
                    : "We could not confirm the payment here, but it may still have gone through.",
                  { description: "Check My Library in a moment, or contact support." },
                );
              } finally {
                setBusy(false);
              }
            })();
          },
          modal: {
            ondismiss: () => {
              setBusy(false);
              toast.info("Checkout closed. Your order is still pending.");
            },
          },
        });

        razorpay.on("payment.failed", (payload) => {
          setBusy(false);
          toast.error(payload.error?.description ?? "The payment did not go through.");
        });

        razorpay.open();
        // Deliberately not clearing `busy` here: the widget is now open and
        // the buyer is mid-payment. It is cleared by the handler, the dismiss
        // callback, or a failure.
        return;
      } catch (error) {
        setBusy(false);
        toast.error(
          error instanceof ApiError && error.status === 409
            ? "You already own this — it is in your library."
            : error instanceof ApiError && error.status === 401
              ? "Sign in to buy this."
              : error instanceof Error
                ? error.message
                : "Could not start checkout",
        );
      }
    },
    [router, options],
  );

  return { buy, busy };
}
