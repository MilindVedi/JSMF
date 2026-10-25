import { api, ensureFreshAccessToken } from "@/lib/api/client";
import type { ReaderGrant, ReaderSource } from "./types";

/**
 * The API's two ways to read: the product itself (owners, and anyone for a
 * free item in the store) and its sample (anyone). Both answer with a link that
 * expires; `renew` asks again without logging another "opened".
 *
 * Both routes are public, so a stale sign-in is refreshed first — otherwise
 * the API would quietly serve a signed-in reader as a visitor.
 */
function apiSource(kind: ReaderSource["kind"], productId: string): ReaderSource {
  const path = `/products/${productId}/${kind === "full" ? "read" : "sample"}`;
  const get = async (url: string) => {
    await ensureFreshAccessToken();
    return api.get<ReaderGrant>(url);
  };
  return {
    kind,
    productId,
    open: () => get(path),
    renew: () => get(`${path}?renew=true`),
  };
}

export const productSource = (productId: string) => apiSource("full", productId);
export const sampleSource = (productId: string) => apiSource("sample", productId);
