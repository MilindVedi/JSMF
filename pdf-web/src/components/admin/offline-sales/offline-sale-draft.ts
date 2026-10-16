import type { OfflinePaymentMethod, OfflineSaleBuyerInput } from "@/lib/api/admin-offline-sales";
import { minorToRupees, rupeesToMinor } from "@/lib/money";

/**
 * A product type's own questions for each buyer — a session's exam and stage —
 * supplied by the page that knows the product. The components here stay
 * generic: they show these as optional dropdowns and pass the answers through.
 */
export interface OfflineSaleDetailField {
  key: string;
  label: string;
  options: string[];
}

/** One buyer as the form holds them: everything as typed, money in rupees. */
export interface DraftBuyer {
  key: string;
  name: string;
  email: string;
  whatsappNumber: string;
  amountPaid: string;
  discount: string;
  method: OfflinePaymentMethod;
  reference: string;
  /** `datetime-local` value, read as IST: "2026-10-10T14:30". */
  paidAtLocal: string;
  note: string;
  details: Record<string, string>;
}

let nextKey = 0;

export function emptyDraft(priceMinor: string): DraftBuyer {
  nextKey += 1;
  return {
    key: `buyer-${nextKey}`,
    name: "",
    email: "",
    whatsappNumber: "",
    amountPaid: minorToRupees(priceMinor),
    discount: "",
    method: "UPI_DIRECT",
    reference: "",
    paidAtLocal: "",
    note: "",
    details: {},
  };
}

/**
 * The form's buyers in the API's shape. Times typed in the form are IST — the
 * zone every session is sold in — so the offset is written out explicitly.
 */
export function draftsToBuyers(drafts: DraftBuyer[]): OfflineSaleBuyerInput[] {
  return drafts.map((draft) => {
    const details = Object.fromEntries(Object.entries(draft.details).filter(([, value]) => value));
    return {
      name: draft.name.trim(),
      email: draft.email.trim(),
      ...(draft.whatsappNumber.trim() && { whatsappNumber: draft.whatsappNumber.trim() }),
      amountPaidMinor: draft.amountPaid.trim() ? rupeesToMinor(draft.amountPaid) : "",
      ...(draft.discount.trim() && { discountMinor: rupeesToMinor(draft.discount) }),
      method: draft.method,
      ...(draft.reference.trim() && { reference: draft.reference.trim() }),
      ...(draft.note.trim() && { note: draft.note.trim() }),
      paidAt: draft.paidAtLocal ? `${draft.paidAtLocal.length === 16 ? `${draft.paidAtLocal}:00` : draft.paidAtLocal}+05:30` : "",
      ...details,
    };
  });
}

/** "12 Oct 2026, 7:30 pm", in IST whatever the admin's own zone. */
export function istLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Now, as a `datetime-local` value in IST — the latest time the form allows. */
export function istNowLocal(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 16);
}

/** A file to start from, offered for download next to the upload button. */
export function templateFile(detailFields: OfflineSaleDetailField[]): string {
  const details = Object.fromEntries(detailFields.map((field) => [field.key, field.options[0] ?? ""]));
  return `${JSON.stringify(
    [
      {
        name: "Riya Sharma",
        email: "riya.sharma@gmail.com",
        whatsappNumber: "+919876543210",
        amountPaidMinor: 119900,
        discountMinor: 30000,
        method: "UPI_DIRECT",
        reference: "UPI reference, optional",
        paidAt: "2026-10-10T14:30:00+05:30",
        note: "Early-bird discount",
        ...details,
      },
      {
        name: "Aman Verma",
        email: "aman.verma@gmail.com",
        amountPaidMinor: 149900,
        method: "RAZORPAY_PAYMENT_PAGE",
        reference: "pay_XXXXXXXXXXXXXX",
        paidAt: "2026-10-11T21:05:00+05:30",
      },
    ],
    null,
    2,
  )}\n`;
}
