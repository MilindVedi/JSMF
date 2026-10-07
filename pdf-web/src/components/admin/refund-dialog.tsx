"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { adminOrderApi, type RefundSpeed } from "@/lib/api/admin";
import type { AdminOrder } from "@/lib/api/types";
import { formatMoney } from "@/lib/money";

/**
 * The one place a refund is confirmed, replacing the chain of browser
 * `confirm`/`prompt` boxes that asked the same three things in three separate
 * dialogs — a sequence that could not show the amount, could not style the
 * irreversible-action warning, and let someone tab past the speed choice
 * without registering that instant costs money.
 *
 * Driven by `order`: non-null opens it, which also means the form is created
 * fresh each time rather than carrying a previous refund's reason or speed.
 */
export function RefundDialog({
  order,
  onClose,
  onRefunded,
}: {
  /** The order to refund, or null when the dialog is closed. */
  order: AdminOrder | null;
  onClose: () => void;
  /** Called after a refund succeeds, so the caller can reload the list. */
  onRefunded: () => void;
}) {
  const [reason, setReason] = useState("");
  const [speed, setSpeed] = useState<RefundSpeed>("NORMAL");
  const [submitting, setSubmitting] = useState(false);

  // A new order means a new refund — never the last one's reason or speed. This
  // is the "reset state when a prop changes" pattern: adjusting state during
  // render rather than in an effect, so React discards the in-progress render
  // instead of painting stale values and re-rendering. Comparing ids also
  // re-clears when a different row is opened back to back without the dialog
  // closing in between.
  //
  // The retained order doubles as what the body reads from, so its amount and
  // email stay on screen while the dialog animates out — `order` is already
  // null by then, and a blank "Returns  to the buyer" would flash otherwise.
  const [shown, setShown] = useState<AdminOrder | null>(null);
  if (order && order.id !== shown?.id) {
    setShown(order);
    setReason("");
    setSpeed("NORMAL");
  }

  async function submit() {
    if (!order) return;

    setSubmitting(true);
    try {
      await adminOrderApi.refund(order.id, reason.trim() || undefined, speed);
      toast.success(
        `${order.orderNumber} refunded${speed === "INSTANT" ? " — instant requested" : ""}`,
      );
      onRefunded();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog
      open={order !== null}
      onOpenChange={(open) => {
        // Never dismiss mid-request: the refund is already with the provider,
        // and a reopened dialog would invite a second attempt on the same order.
        if (!open && !submitting) onClose();
      }}
    >
      <AlertDialogContent>
        <div className="flex size-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
          <RotateCcw className="size-4.5" />
        </div>

        <AlertDialogTitle className="mt-4">
          Refund {shown?.orderNumber}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Returns{" "}
          <span className="font-medium text-foreground">
            {shown ? formatMoney(shown.totalAmountMinor, shown.currency) : ""}
          </span>{" "}
          to {shown?.customerEmail ?? "the buyer"} and revokes their access to every item in
          this order now. They are emailed either way. This cannot be undone from here.
        </AlertDialogDescription>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(optional, shown to the buyer)</span></span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate payment"
              rows={2}
              disabled={submitting}
            />
          </label>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Speed</span>
            <RadioGroup
              value={speed}
              onValueChange={(value) => setSpeed(value as RefundSpeed)}
              className="gap-0 overflow-hidden rounded-lg border border-border"
            >
              <SpeedOption
                value="NORMAL"
                selected={speed === "NORMAL"}
                icon={<RotateCcw className="size-4" />}
                title="Normal"
                detail="Free. Back to the original method in about 5–7 working days."
              />
              <SpeedOption
                value="INSTANT"
                selected={speed === "INSTANT"}
                icon={<Zap className="size-4" />}
                title="Instant"
                detail="Usually within minutes, but Razorpay charges a fee per instant refund — and falls back to normal where the payment method can't take it."
                topBorder
              />
            </RadioGroup>
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="ghost" size="lg" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" disabled={submitting} onClick={submit}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : speed === "INSTANT" ? (
              "Refund instantly"
            ) : (
              "Refund"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** One row of the speed picker — the whole row is the label, so the hit target
 *  is the option, not just the dot. */
function SpeedOption({
  value,
  selected,
  icon,
  title,
  detail,
  topBorder,
}: {
  value: RefundSpeed;
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  topBorder?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 p-3 transition-colors ${
        topBorder ? "border-t border-border" : ""
      } ${selected ? "bg-accent" : "hover:bg-muted/50"}`}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
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
