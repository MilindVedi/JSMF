import { api } from "./client";

/**
 * Buyers who paid outside checkout, recorded by an admin
 * (backend: /admin/products/:productId/offline-sales). Product-agnostic: the
 * backend decides which product types accept them — live sessions, today.
 */

export type OfflinePaymentMethod = "RAZORPAY_PAYMENT_PAGE" | "UPI_DIRECT" | "BANK_TRANSFER" | "CASH" | "OTHER";

export const OFFLINE_METHOD_LABEL: Record<OfflinePaymentMethod, string> = {
  UPI_DIRECT: "UPI (paid to us directly)",
  RAZORPAY_PAYMENT_PAGE: "Razorpay Payment Page",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other",
};

/**
 * One buyer as the API reads them — and as an uploaded file may write them.
 * Money is paise as a string; `paidAt` carries its timezone.
 */
export interface OfflineSaleBuyerInput {
  name: string;
  email: string;
  whatsappNumber?: string;
  amountPaidMinor: string;
  discountMinor?: string;
  method: OfflinePaymentMethod;
  reference?: string;
  note?: string;
  paidAt: string;
  /** The product type's own answers (a session's exam and stage). */
  [detail: string]: unknown;
}

export interface OfflineSaleRowError {
  /** 0-based row; -1 for the list as a whole. */
  index: number;
  field: string;
  message: string;
}

export interface OfflineSalePlanRow {
  index: number;
  name: string;
  email: string;
  whatsappNumber: string | null;
  amountPaidMinor: string;
  discountMinor: string;
  method: OfflinePaymentMethod;
  reference: string | null;
  note: string | null;
  paidAt: string;
  details: Record<string, unknown>;
  /** create = new account · attach = existing account · skip = already has access. */
  action: "create" | "attach" | "skip";
  existingName: string | null;
}

export interface OfflineSalePreview {
  product: { id: string; title: string; type: string; priceAmountMinor: string; currency: string };
  rows: OfflineSalePlanRow[];
  errors: OfflineSaleRowError[];
  warnings: string[];
}

export interface OfflineSaleResult {
  recorded: Array<{ index: number; email: string; orderNumber: string }>;
  skipped: Array<{ index: number; email: string; reason: string }>;
  failed: Array<{ index: number; email: string; reason: string }>;
}

export interface OfflineSale {
  id: string;
  user: { id: string; name: string; email: string | null; contactPhone: string | null };
  method: OfflinePaymentMethod;
  reference: string | null;
  note: string | null;
  paidAt: string;
  entry: "FORM" | "FILE" | "SCRIPT";
  recordedBy: string | null;
  createdAt: string;
  order: {
    orderNumber: string;
    status: string;
    listPriceMinor: string;
    discountMinor: string;
    amountPaidMinor: string;
    currency: string;
  };
  /** The product type's answers, already labelled (e.g. { Exam: "NEET-PG" }). */
  details: Record<string, string>;
}

const base = (productId: string) => `/admin/products/${productId}/offline-sales`;

export const offlineSalesApi = {
  list: (productId: string) => api.get<OfflineSale[]>(base(productId)),
  /** Checks the list and says what recording it would do. Writes nothing. */
  preview: (productId: string, buyers: unknown[]) =>
    api.post<OfflineSalePreview>(`${base(productId)}/preview`, { buyers }),
  record: (productId: string, buyers: unknown[], entry: "FORM" | "FILE") =>
    api.post<OfflineSaleResult>(base(productId), { buyers, entry }),
};
