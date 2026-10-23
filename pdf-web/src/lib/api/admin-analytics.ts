import { api } from "./client";

/**
 * The admin Analytics page — one aggregate summary per date range. ADMIN only,
 * server-enforced. Numbers only; the API never returns one visitor's trail.
 */

export type AnalyticsApp = "MAIN" | "STORE" | "PYQ";

export interface AnalyticsSummary {
  app: AnalyticsApp;
  /** Inclusive India-time dates, YYYY-MM-DD. */
  from: string;
  to: string;
  totals: { visitors: number; sessions: number; pageViews: number; events: number };
  daily: Array<{ day: string; visitors: number; pageViews: number }>;
  /** Unique visitors reaching each step: page_view → book_click → register_open → checkout_open → payment_success. */
  funnel: Array<{ step: string; visitors: number }>;
  /** From the accounts and orders tables, not the browser. For MAIN: live-session and one-to-one orders only, refunded ones included. */
  server: { usersCreated: number; ordersCreated: number; ordersPaid: number; paidAmountMinor: string };
  topPaths: Array<{ path: string; views: number; visitors: number }>;
  topReferrers: Array<{ referrer: string; visitors: number }>;
  topUtmSources: Array<{ source: string; medium: string | null; visitors: number }>;
  devices: Array<{ deviceType: string; visitors: number }>;
}

export type RevenueStream = "LIVE_SESSION" | "MENTORSHIP" | "STORE" | "PYQ_PLAN";
export type RevenueChannel =
  | "RAZORPAY_CHECKOUT"
  | "RAZORPAY_PAYMENT_PAGE"
  | "UPI_DIRECT"
  | "BANK_TRANSFER"
  | "CASH"
  | "OTHER"
  | "STUB"
  | "FREE";

/** Money is minor units (paise) as strings. */
export interface FinanceTotals {
  /** Paid by buyers for orders paid in the range, after discounts. */
  grossMinor: string;
  discountMinor: string;
  taxMinor: string;
  /** Refunds issued in the range (whenever the sale was). Failed refunds excluded. */
  refundedMinor: string;
  /** Part of `refundedMinor` not yet confirmed as sent back by the provider. */
  refundPendingMinor: string;
  netMinor: string;
  paidOrders: number;
  freeOrders: number;
  refunds: number;
  payingBuyers: number;
  newBuyers: number;
}

/** Every app: live sessions, one-to-one calls, the store and PYQ plans. */
export interface FinanceSummary {
  from: string;
  to: string;
  bucket: "day" | "month";
  totals: FinanceTotals;
  /** The equally long period just before; null for "all time". */
  previous: FinanceTotals | null;
  lifetime: { grossMinor: string; refundedMinor: string; netMinor: string; payingBuyers: number };
  series: Array<{ bucket: string; grossMinor: string; refundedMinor: string; orders: number }>;
  byStream: Array<{ stream: RevenueStream; orders: number; grossMinor: string; refundedMinor: string; netMinor: string }>;
  byChannel: Array<{ channel: RevenueChannel; orders: number; grossMinor: string }>;
  /** RAZORPAY, or the manual method an admin recorded (UPI, BANK_TRANSFER, CASH, OTHER). */
  refundsByMethod: Array<{ method: string; refunds: number; amountMinor: string; pendingMinor: string }>;
  topProducts: Array<{
    productId: string;
    title: string;
    stream: RevenueStream;
    units: number;
    grossMinor: string;
    refundedMinor: string;
    netMinor: string;
  }>;
  coupons: Array<{ code: string; orders: number; discountMinor: string; grossMinor: string }>;
  /** In-app checkout only. */
  checkout: { started: number; paid: number; abandoned: number; failedPayments: number };
}

export const adminAnalyticsApi = {
  summary(params: { from?: string; to?: string; app?: AnalyticsApp } = {}) {
    const query = new URLSearchParams();
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    if (params.app) query.set("app", params.app);
    const suffix = query.toString() ? `?${query}` : "";
    return api.get<AnalyticsSummary>(`/admin/analytics/summary${suffix}`);
  },

  /** `all: true` is from the first sale to today; `from`/`to` are then ignored. */
  finance(params: { from?: string; to?: string; all?: boolean } = {}) {
    const query = new URLSearchParams();
    if (params.all) query.set("all", "true");
    else {
      if (params.from) query.set("from", params.from);
      if (params.to) query.set("to", params.to);
    }
    const suffix = query.toString() ? `?${query}` : "";
    return api.get<FinanceSummary>(`/admin/analytics/finance${suffix}`);
  },
};
