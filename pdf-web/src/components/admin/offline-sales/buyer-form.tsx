"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  OFFLINE_METHOD_LABEL,
  type OfflinePaymentMethod,
  type OfflineSaleRowError,
} from "@/lib/api/admin-offline-sales";
import { formatMoney, minorToRupees, rupeesToMinor } from "@/lib/money";
import { emptyDraft, istNowLocal, type DraftBuyer, type OfflineSaleDetailField } from "./offline-sale-draft";

/** What each field is called in the API's error messages, to show the message under its field. */
const FIELD_OF_ERROR: Record<string, keyof DraftBuyer | "details"> = {
  name: "name",
  email: "email",
  whatsappNumber: "whatsappNumber",
  amountPaidMinor: "amountPaid",
  discountMinor: "discount",
  method: "method",
  reference: "reference",
  paidAt: "paidAtLocal",
  note: "note",
  details: "details",
};

const NONE = "__none__";

/**
 * Buyers typed in by hand, one card each. Amounts are rupees here; the API
 * receives paise. Changing the discount recalculates the amount paid from the
 * list price; the amount paid can still be set directly (a buyer who paid an
 * older price).
 */
export function BuyerForm({
  drafts,
  onChange,
  priceMinor,
  detailFields,
  errors,
}: {
  drafts: DraftBuyer[];
  onChange: (drafts: DraftBuyer[]) => void;
  priceMinor: string;
  detailFields: OfflineSaleDetailField[];
  /** From the last check, by row. */
  errors: OfflineSaleRowError[];
}) {
  const update = (key: string, patch: Partial<DraftBuyer>) =>
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

  const maxLocal = istNowLocal();

  return (
    <div className="space-y-4">
      {drafts.map((draft, index) => {
        const rowErrors = errors.filter((error) => error.index === index);
        const errorFor = (field: keyof DraftBuyer | "details") =>
          rowErrors.filter((error) => FIELD_OF_ERROR[error.field] === field).map((error) => error.message);
        const listPrice = Number(rupeesToMinor(draft.amountPaid || "0")) + Number(rupeesToMinor(draft.discount || "0"));
        const offList = draft.amountPaid.trim() !== "" && String(listPrice) !== priceMinor;

        return (
          <fieldset
            key={draft.key}
            className={`space-y-4 rounded-lg border p-4 ${rowErrors.length ? "border-destructive/60" : "border-border"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <legend className="text-sm font-semibold">Buyer {index + 1}</legend>
              {drafts.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(drafts.filter((d) => d.key !== draft.key))}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Full name" errors={errorFor("name")}>
                {(id) => (
                  <Input
                    id={id}
                    value={draft.name}
                    maxLength={120}
                    onChange={(e) => update(draft.key, { name: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label="Email"
                hint="The address they will sign in with — their account is matched by it."
                errors={errorFor("email")}
              >
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    value={draft.email}
                    onChange={(e) => update(draft.key, { email: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label="WhatsApp number (optional)"
                hint="+44 7911 123456, or a 10-digit Indian mobile."
                errors={errorFor("whatsappNumber")}
              >
                {(id) => (
                  <Input
                    id={id}
                    type="tel"
                    value={draft.whatsappNumber}
                    onChange={(e) => update(draft.key, { whatsappNumber: e.target.value })}
                  />
                )}
              </Field>

              <Field label="How they paid" errors={errorFor("method")}>
                {(id) => (
                  <Select
                    items={OFFLINE_METHOD_LABEL}
                    value={draft.method}
                    onValueChange={(value: string | null) =>
                      update(draft.key, { method: (value ?? "UPI_DIRECT") as OfflinePaymentMethod })
                    }
                  >
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(OFFLINE_METHOD_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field
                label={draft.method === "RAZORPAY_PAYMENT_PAGE" ? "Razorpay payment id" : "Reference (optional)"}
                hint={
                  draft.method === "RAZORPAY_PAYMENT_PAGE"
                    ? "pay_… from the Razorpay dashboard. With it, a refund there takes the seat back."
                    : "A UPI reference (UTR), cheque number — whatever finds the payment later."
                }
                errors={errorFor("reference")}
              >
                {(id) => (
                  <Input
                    id={id}
                    value={draft.reference}
                    maxLength={100}
                    placeholder={draft.method === "RAZORPAY_PAYMENT_PAGE" ? "pay_XXXXXXXXXXXXXX" : ""}
                    onChange={(e) => update(draft.key, { reference: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Paid on (IST)" errors={errorFor("paidAtLocal")}>
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={draft.paidAtLocal}
                    max={maxLocal}
                    onChange={(e) => update(draft.key, { paidAtLocal: e.target.value })}
                  />
                )}
              </Field>

              <Field label="Discount, ₹ (optional)" errors={errorFor("discount")}>
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={draft.discount}
                    placeholder="0"
                    onChange={(e) => {
                      const discount = e.target.value;
                      const paid = Math.max(Number(priceMinor) - Number(rupeesToMinor(discount || "0")), 0);
                      update(draft.key, {
                        discount,
                        amountPaid: Number.isFinite(paid) ? minorToRupees(String(paid)) || "0" : draft.amountPaid,
                      });
                    }}
                  />
                )}
              </Field>
              <Field
                label="Amount paid, ₹"
                hint={
                  offList
                    ? `Paid + discount is ${formatMoney(String(listPrice))}, not the list price of ${formatMoney(priceMinor)} — fine for an older price.`
                    : `List price ${formatMoney(priceMinor)}.`
                }
                errors={errorFor("amountPaid")}
              >
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={draft.amountPaid}
                    onChange={(e) => update(draft.key, { amountPaid: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Note (optional)" errors={errorFor("note")}>
                {(id) => (
                  <Input
                    id={id}
                    value={draft.note}
                    maxLength={500}
                    onChange={(e) => update(draft.key, { note: e.target.value })}
                  />
                )}
              </Field>

              {detailFields.map((field) => (
                <Field key={field.key} label={`${field.label} (optional)`} errors={[]}>
                  {(id) => (
                    <Select
                      items={{ [NONE]: "Not asked", ...Object.fromEntries(field.options.map((o) => [o, o])) }}
                      value={draft.details[field.key] || NONE}
                      onValueChange={(value: string | null) =>
                        update(draft.key, {
                          details: { ...draft.details, [field.key]: !value || value === NONE ? "" : value },
                        })
                      }
                    >
                      <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not asked</SelectItem>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              ))}
            </div>

            {errorFor("details").map((message) => (
              <p key={message} className="text-xs font-medium text-destructive">
                {message}
              </p>
            ))}
          </fieldset>
        );
      })}

      <Button type="button" variant="outline" onClick={() => onChange([...drafts, emptyDraft(priceMinor)])}>
        <Plus className="size-4" /> Add another buyer
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  errors,
  children,
}: {
  label: string;
  hint?: string;
  errors: string[];
  /** Given the id the label points at, so every field is announced by its label. */
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {errors.length > 0
        ? errors.map((message) => (
            <p key={message} className="text-xs font-medium text-destructive">
              {message}
            </p>
          ))
        : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
