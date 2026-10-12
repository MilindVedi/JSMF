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
  /** From the accounts and orders tables, not the browser. For MAIN, orders are live-session orders. */
  server: { usersCreated: number; ordersCreated: number; ordersPaid: number; paidAmountMinor: string };
  topPaths: Array<{ path: string; views: number; visitors: number }>;
  topReferrers: Array<{ referrer: string; visitors: number }>;
  topUtmSources: Array<{ source: string; medium: string | null; visitors: number }>;
  devices: Array<{ deviceType: string; visitors: number }>;
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
};
