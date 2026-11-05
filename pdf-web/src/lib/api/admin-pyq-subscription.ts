import { api } from "./client";

/**
 * Subscription & pricing management. ADMIN-gated server-side; every write is
 * also refused (409) unless the API runs with SUBSCRIPTION_MANAGEMENT_ENABLED,
 * which `managementEnabled` mirrors read-only.
 */

export interface SubscriptionSettings {
  trialEnabled: boolean;
  trialDays: number;
  features: string[];
}

export interface AdminPlan {
  id: string;
  title: string;
  subtitle: string | null;
  durationMonths: number | null;
  /** Older day-based plans only. */
  legacyDurationDays: number | null;
  approximateDays: number;
  /** Paise, as a string. */
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  popular: boolean;
  onSale: boolean;
  activeSubscribers: number;
  createdAt: string;
}

export interface SubscriptionOverview {
  managementEnabled: boolean;
  settings: SubscriptionSettings;
  plans: AdminPlan[];
}

export interface PlanInput {
  title?: string;
  subtitle?: string | null;
  durationMonths: number;
  priceAmountMinor: string;
  compareAtAmountMinor?: string | null;
  popular?: boolean;
  onSale?: boolean;
}

export const adminSubscriptionApi = {
  overview: () => api.get<SubscriptionOverview>("/admin/pyq/subscription"),

  updateSettings: (input: Partial<SubscriptionSettings>) =>
    api.patch<SubscriptionSettings>("/admin/pyq/subscription/settings", input),

  createPlan: (input: PlanInput) => api.post<AdminPlan>("/admin/pyq/subscription/plans", input),

  /** A new price or length comes back as a new plan, with a new id. */
  updatePlan: (id: string, input: Partial<Omit<PlanInput, "onSale">>) =>
    api.patch<AdminPlan>(`/admin/pyq/subscription/plans/${id}`, input),

  setOnSale: (id: string, onSale: boolean) =>
    api.put<AdminPlan>(`/admin/pyq/subscription/plans/${id}/on-sale`, { onSale }),
};
