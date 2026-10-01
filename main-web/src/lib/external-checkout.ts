/**
 * A temporary bypass: send people to a Razorpay-hosted Payment Page instead of
 * this site's own checkout.
 *
 * It exists for one reason. Razorpay will not approve API keys for a website
 * until that website passes review, but a Payment Page is hosted on rzp.io and
 * works immediately — so seats can be sold before the integration is live.
 *
 * **Empty is the default and the real flow.** Setting this does not delete
 * anything: the normal registration dialog, seat counting, entitlements and
 * emails all stay exactly as they are, and clearing the variable switches
 * straight back to them. Remove this file once Razorpay approves the site.
 *
 * Deliberately read on the server and passed down as a prop rather than read
 * inside a client component: `NEXT_PUBLIC_` values are inlined into the client
 * bundle at **build** time, so a client-side read would need a rebuilt image to
 * change, while this only needs the environment variable changed.
 */
export function externalCheckoutUrl(): string | null {
  const raw = process.env.EXTERNAL_CHECKOUT_URL?.trim();
  if (!raw) return null;

  // A malformed value must not produce a dead button: fall back to the real
  // flow, which always works, rather than linking somewhere that does not exist.
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What someone is told after paying on Razorpay, since nothing is granted automatically yet. */
export const EXTERNAL_CHECKOUT_NOTICE =
  "Your seat is reserved. We will email you the joining link and your free PDF before the session.";
