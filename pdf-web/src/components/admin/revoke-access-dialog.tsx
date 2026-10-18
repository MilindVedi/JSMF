"use client";

import { useState } from "react";
import { Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { adminOrderApi } from "@/lib/api/admin";
import type { AdminOrder } from "@/lib/api/types";

/**
 * Takes away what an order gave, without touching money — for a refund that was
 * recorded with "keep access" and later should not have been. Driven by
 * `order`: non-null opens it.
 */
export function RevokeAccessDialog({
  order,
  onClose,
  onRevoked,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shown, setShown] = useState<AdminOrder | null>(null);
  if (order && order !== shown) {
    setShown(order);
    setReason("");
  }

  async function submit() {
    if (!order) return;
    setSubmitting(true);
    try {
      await adminOrderApi.revokeAccess(order.id, reason.trim() || undefined);
      toast.success(`${order.orderNumber}: access removed`);
      onRevoked();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke access");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog
      open={order !== null}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <AlertDialogContent>
        <div className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldOff className="size-4.5" />
        </div>
        <AlertDialogTitle className="mt-4">Revoke access for {shown?.orderNumber}?</AlertDialogTitle>
        <AlertDialogDescription>
          {shown?.user.name} loses everything this order gave: its PDFs, a session seat with its day materials, a booked
          1:1 call. No money moves and they are not emailed. This cannot be undone from here.
        </AlertDialogDescription>

        <label className="mt-5 grid gap-1.5">
          <span className="text-sm font-medium">
            Reason <span className="font-normal text-muted-foreground">(optional, kept on the order)</span>
          </span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={submitting}
          />
        </label>

        <AlertDialogFooter>
          <Button variant="ghost" size="lg" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="lg" disabled={submitting} onClick={submit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Revoke access"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
