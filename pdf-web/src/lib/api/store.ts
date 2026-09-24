import { api } from "./client";
import type {
  AuthSession,
  Order,
  Paginated,
  ProductDetail,
  ProductListItem,
  Taxonomy,
} from "./types";

export interface StorefrontProduct extends ProductListItem {
  coverUrl: string | null;
}

export interface CheckoutFree {
  kind: "FREE";
  orderId: string;
  orderNumber: string;
  productId: string;
}

export interface CheckoutPaid {
  kind: "PAYMENT_REQUIRED";
  orderId: string;
  orderNumber: string;
  amountMinor: string;
  currency: string;
  providerOrderId: string;
  /** Publishable key for the widget. The secret never leaves the server. */
  checkoutKeyId: string;
}

export type CheckoutResult = CheckoutFree | CheckoutPaid;

export interface Entitlement {
  id: string;
  productId: string;
  source: string;
  grantedAt: string;
  product: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    type: string;
    accessType: string;
    status: string;
  };
}

export const storeApi = {
  /** `terms` are taxonomy term slugs, ANDed — works for any taxonomy. */
  browse(params: { q?: string; terms?: string[]; page?: number } = {}) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.terms?.length) query.set("terms", params.terms.join(","));
    if (params.page) query.set("page", String(params.page));

    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Paginated<StorefrontProduct>>(`/catalog/products${suffix}`);
  },

  filters: () => api.get<Taxonomy[]>("/catalog/taxonomies"),

  product: (slug: string) => api.get<ProductDetail>(`/catalog/products/${slug}`),

  checkout: (productId: string) => api.post<CheckoutResult>("/orders", { productId }),

  verifyPayment: (payload: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => api.post<{ orderId: string; status: string }>("/payments/verify", payload),

  /**
   * Development only, and only meaningful when the API is running
   * `PAYMENT_DRIVER=stub` — the server answers 404 otherwise. Stands in for
   * the real checkout widget, which the stub driver cannot open (Razorpay's
   * own script rejects its fake key and order id outright). Settles through
   * the same signature-verified path a real payment takes; see the backend
   * endpoint for what it actually does.
   */
  simulatePayment: (orderId: string, outcome: "success" | "failure" = "success") =>
    api.post<{ success: true; orderId: string; status: string } | { success: false }>(
      `/orders/${orderId}/simulate-payment`,
      { outcome },
    ),

  purchases: () => api.get<Entitlement[]>("/me/purchases"),

  orders: () => api.get<Order[]>("/orders"),

  /**
   * Returns a short-lived signed URL rather than the file itself, so the
   * download goes straight from storage to the browser and never through this
   * API. Works unauthenticated for free products.
   */
  downloadUrl: (productId: string) =>
    api.get<{ url: string; expiresAt: string; filename: string | null }>(
      `/products/${productId}/download`,
    ),

  register: (input: { email: string; name: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/register", input),
};
