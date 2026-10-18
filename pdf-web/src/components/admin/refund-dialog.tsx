"use client";

import { useState } from "react";
import { HandCoins, Loader2, RotateCcw, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminOrderApi, type RefundSpeed } from "@/lib/api/admin";
import type { AdminOrder, ManualRefundMethod } from "@/lib/api/types";
import { formatMoney, rupeesToMinor } from "@/lib/money";

type Route = "PROVIDER" | "MANUAL";

const METHODS: Array<{ value: ManualRefundMethod; label: string }> = [
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER", label: "Other" },
];

/** Paise to a rupee string for an input: "19900" becomes "199", "19950" becomes "199.50". */
function minorToRupees(minor: string): string {
  const value = Number(minor) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Now, as a `datetime-local` value in the admin's own time zone. */
function localNow(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

/**
 * The one place a refund is made or recorded.
 *
 * Two routes: **through Razorpay** (JSMF sends the money back) or **I already
 * refunded it myself** (the admin sent it by UPI, bank or cash, and this only
 * records it). Either can be partial. Whether access goes is the admin's call
 * every time — it starts on for a full refund and off for a partial one, the
 * rule the platform followed before, and follows the amount until touched.
 *
 * Driven by `order`: non-null opens it, which also means the form starts fresh
 * each time rather than carrying a previous refund's values.
 */
export function RefundDialog({
  order,
  refundsEnabled,
  onClose,
  onRefunded,
}: {
  /** The order to refund, or null when the dialog is closed. */
  order: AdminOrder | null;
  /** Whether this deployment allows Razorpay refunds from the panel (REFUNDS_ENABLED). */
  refundsEnabled: boolean;
  onClose: () => void;
  /** Called after a refund succeeds, so the caller can reload. */
  onRefunded: () => void;
}) {
  const [route, setRoute] = useState<Route>("PROVIDER");
  const [amount, setAmount] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [revokeTouched, setRevokeTouched] = useState(false);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState("");
  const [speed, setSpeed] = useState<RefundSpeed>("NORMAL");
  const [method, setMethod] = useState<ManualRefundMethod>("UPI");
  const [reference, setReference] = useState("");
  const [refundedAt, setRefundedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Every opening is a new refund — the "reset state when a prop changes"
  // pattern, adjusting state during render rather than in an effect. Compared
  // by object, not id: reopening the same order after a partial refund hands
  // in a freshly loaded object, and its new numbers must replace the old. The
  // retained order is also what the body reads from, so its numbers stay on
  // screen while the dialog animates out after `order` has gone null.
  const [shown, setShown] = useState<AdminOrder | null>(null);
  if (order && order !== shown) {
    setShown(order);
    setRoute(order.refundableThroughProvider && refundsEnabled ? "PROVIDER" : "MANUAL");
    setAmount(minorToRupees(order.refundableMinor));
    setRevoke(order.hasAccess);
    setRevokeTouched(false);
    setNotify(true);
    setReason("");
    setSpeed("NORMAL");
    setMethod("UPI");
    setReference("");
    setRefundedAt(localNow());
  }

  const providerAvailable = Boolean(shown?.refundableThroughProvider && refundsEnabled);
  const amountMinor = rupeesToMinor(amount);
  const leftMinor = shown?.refundableMinor ?? "0";
  const isFull = amountMinor === leftMinor;
  const amountError =
    !amount.trim() || !/^\d+$/.test(amountMinor) || Number(amountMinor) <= 0
      ? "Enter an amount above zero."
      : BigInt(amountMinor) > BigInt(leftMinor)
        ? `At most ${formatMoney(leftMinor, shown?.currency)} is left to refund.`
        : null;

  function changeAmount(value: string) {
    setAmount(value);
    // Until the admin decides for themselves, the switch follows the amount:
    // on for everything that is left, off for part of it.
    if (!revokeTouched && shown?.hasAccess) setRevoke(rupeesToMinor(value) === leftMinor);
  }

  async function submit() {
    if (!order || amountError) return;

    setSubmitting(true);
    try {
      const common = {
        reason: reason.trim() || undefined,
        revokeAccess: Boolean(order.hasAccess && revoke),
        notifyBuyer: notify,
      };
      const result =
        route === "PROVIDER"
          ? await adminOrderApi.refund(order.id, { ...common, speed, amountMinor })
          : await adminOrderApi.manualRefund(order.id, {
              ...common,
              amountMinor,
              method,
              reference: reference.trim() || undefined,
              refundedAt: new Date(refundedAt).toISOString(),
            });

      const what = route === "PROVIDER" ? "refunded" : "refund recorded";
      toast.success(
        `${order.orderNumber}: ${formatMoney(amountMinor, order.currency)} ${what}` +
          (result.accessRevoked ? ", access removed" : order.hasAccess ? ", access kept" : ""),
      );
      onRefunded();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed");
    } finally {
      setSubmitting(false);
    }
  }

  const paidMinor = shown ? String(BigInt(shown.refundedMinor) + BigInt(shown.refundableMinor)) : "0";

  return (
    <AlertDialog
      open={order !== null}
      onOpenChange={(open) => {
        // Never dismiss mid-request: the refund may already be with the
        // provider, and a reopened dialog would invite a second attempt.
        if (!open && !submitting) onClose();
      }}
    >
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <div className="flex size-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
          <RotateCcw className="size-4.5" />
        </div>

        <AlertDialogTitle className="mt-4">Refund {shown?.orderNumber}</AlertDialogTitle>
        <AlertDialogDescription>
          {shown?.user.name} ({shown?.customerEmail ?? "no email"}) paid{" "}
          <span className="font-medium text-foreground">{formatMoney(paidMinor, shown?.currency)}</span>
          {shown && shown.refundedMinor !== "0" && (
            <>
              , {formatMoney(shown.refundedMinor, shown.currency)} already refunded,{" "}
              <span className="font-medium text-foreground">{formatMoney(leftMinor, shown.currency)} left</span>
            </>
          )}
          .
        </AlertDialogDescription>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">How</span>
            <RadioGroup
              value={route}
              onValueChange={(value) => setRoute(value as Route)}
              className="gap-0 overflow-hidden rounded-lg border border-border"
            >
              <Option
                value="PROVIDER"
                selected={route === "PROVIDER"}
                disabled={!providerAvailable}
                icon={<RotateCcw className="size-4" />}
                title="Refund through Razorpay"
                detail={
                  !shown?.refundableThroughProvider
                    ? "Not possible: this payment did not go through Razorpay (for example a direct UPI transfer)."
                    : !refundsEnabled
                      ? "Turned off on this server (REFUNDS_ENABLED). Refund it yourself and record it below."
                      : "JSMF asks Razorpay to send the money back to how they paid."
                }
              />
              <Option
                value="MANUAL"
                selected={route === "MANUAL"}
                icon={<HandCoins className="size-4" />}
                title="I already refunded it myself"
                detail="You sent the money by UPI, bank transfer or cash. This only records it; nothing is sent to Razorpay."
                topBorder
              />
            </RadioGroup>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Amount (₹) <span className="font-normal text-muted-foreground">· all that is left, or part of it</span>
            </span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => changeAmount(e.target.value.replace(/[^\d.]/g, ""))}
              disabled={submitting}
              aria-invalid={amountError !== null}
            />
            {amountError ? (
              <span className="text-xs text-destructive">{amountError}</span>
            ) : (
              <span className="text-xs text-muted-foreground">{isFull ? "Full refund" : "Partial refund"}</span>
            )}
          </label>

          {route === "MANUAL" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Sent by</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as ManualRefundMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">When</span>
                <Input
                  type="datetime-local"
                  value={refundedAt}
                  max={localNow()}
                  onChange={(e) => setRefundedAt(e.target.value)}
                  disabled={submitting}
                />
              </label>
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-sm font-medium">
                  Reference <span className="font-normal text-muted-foreground">(optional, e.g. UPI UTR; shown in the email)</span>
                </span>
                <Input
                  value={reference}
                  maxLength={100}
                  onChange={(e) => setReference(e.target.value)}
                  disabled={submitting}
                />
              </label>
            </div>
          )}

          {route === "PROVIDER" && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Speed</span>
              <RadioGroup
                value={speed}
                onValueChange={(value) => setSpeed(value as RefundSpeed)}
                className="gap-0 overflow-hidden rounded-lg border border-border"
              >
                <Option
                  value="NORMAL"
                  selected={speed === "NORMAL"}
                  icon={<RotateCcw className="size-4" />}
                  title="Normal"
                  detail="Free. Back to the original method in about 5–7 working days."
                />
                <Option
                  value="INSTANT"
                  selected={speed === "INSTANT"}
                  icon={<Zap className="size-4" />}
                  title="Instant"
                  detail="Usually within minutes, but Razorpay charges a fee per instant refund — and falls back to normal where the payment method can't take it."
                  topBorder
                />
              </RadioGroup>
            </div>
          )}

          <div className="grid gap-3 rounded-lg border border-border p-3">
            {shown?.hasAccess ? (
              <div className="flex items-start gap-3">
                <Switch
                  id="refund-revoke"
                  checked={revoke}
                  onCheckedChange={(checked: boolean) => {
                    setRevoke(checked);
                    setRevokeTouched(true);
                  }}
                  disabled={submitting}
                />
                <Label htmlFor="refund-revoke" className="grid gap-0.5 font-normal">
                  <span className="text-sm font-medium">Revoke access</span>
                  <span className="text-xs text-muted-foreground">
                    {revoke
                      ? "Everything this order gave is taken away now: PDFs, a session seat with its day materials, a booked 1:1 call."
                      : "They keep everything. You can revoke access later from the Orders page."}
                  </span>
                </Label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Access was already removed from this order.</p>
            )}
            <div className="flex items-start gap-3">
              <Switch
                id="refund-notify"
                checked={notify}
                onCheckedChange={(checked: boolean) => setNotify(checked)}
                disabled={submitting}
              />
              <Label htmlFor="refund-notify" className="grid gap-0.5 font-normal">
                <span className="text-sm font-medium">Email the buyer</span>
                <span className="text-xs text-muted-foreground">
                  {shown?.customerEmail
                    ? `Sends ${shown.customerEmail} the amount${route === "MANUAL" ? ", how and when it was sent" : ""}, and whether access changed.`
                    : "This order has no email address, so nothing will be sent."}
                </span>
              </Label>
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Reason <span className="font-normal text-muted-foreground">(optional, kept on the order, not emailed)</span>
            </span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate payment"
              rows={2}
              maxLength={500}
              disabled={submitting}
            />
          </label>
        </div>

        <AlertDialogFooter>
          <Button variant="ghost" size="lg" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            disabled={submitting || amountError !== null || (route === "PROVIDER" && !providerAvailable) || (route === "MANUAL" && !refundedAt)}
            onClick={submit}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : route === "MANUAL" ? (
              `Record ${formatMoney(amountMinor, shown?.currency)} refund`
            ) : speed === "INSTANT" ? (
              `Refund ${formatMoney(amountMinor, shown?.currency)} instantly`
            ) : (
              `Refund ${formatMoney(amountMinor, shown?.currency)}`
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** One row of a picker — the whole row is the label, so the hit target is the option, not just the dot. */
function Option({
  value,
  selected,
  icon,
  title,
  detail,
  topBorder,
  disabled,
}: {
  value: string;
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  topBorder?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 transition-colors ${topBorder ? "border-t border-border" : ""} ${
        disabled ? "cursor-not-allowed opacity-60" : selected ? "cursor-pointer bg-accent" : "cursor-pointer hover:bg-muted/50"
      }`}
    >
      <RadioGroupItem value={value} className="mt-0.5" disabled={disabled} />
      <span className="grid gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}
