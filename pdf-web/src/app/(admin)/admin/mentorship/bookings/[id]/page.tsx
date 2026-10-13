"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { BookingStatusBadge, isoToZonedLocal, zonedLocalToIso } from "@/components/admin/mentorship/booking-status";
import { RefundDialog } from "@/components/admin/refund-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminOrderApi } from "@/lib/api/admin";
import { adminMentorshipApi, type AdminBooking } from "@/lib/api/admin-mentorship";
import { adminSettingsApi } from "@/lib/api/settings";
import type { AdminOrder } from "@/lib/api/types";
import { formatMoney } from "@/lib/money";

const sentLabel = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso))
    : "not yet";

/**
 * One booked call: who, when, what they want to discuss — and everything an
 * admin does to it: add the joining link, move it, mark how it went, cancel,
 * or refund (which cancels it by itself). The page the admin alert email opens.
 */
export default function AdminMentorshipBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [booking, setBooking] = useState<AdminBooking | null>(null);
  const [meetUrl, setMeetUrl] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [refundsEnabled, setRefundsEnabled] = useState(false);
  const [refundOrder, setRefundOrder] = useState<AdminOrder | null>(null);

  const load = useCallback(() => {
    adminMentorshipApi
      .booking(id)
      .then((data) => {
        setBooking(data);
        setMeetUrl(data.meetUrl ?? "");
        setMoveTo(isoToZonedLocal(data.startsAt, data.offering.timezone));
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load the booking"));
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => {
    adminSettingsApi
      .get()
      .then((settings) => setRefundsEnabled(settings.refundsEnabled))
      .catch(() => undefined);
  }, []);

  async function run(label: string, action: () => Promise<AdminBooking>, success: string) {
    setBusy(label);
    try {
      const updated = await action();
      setBooking(updated);
      setMeetUrl(updated.meetUrl ?? "");
      setMoveTo(isoToZonedLocal(updated.startsAt, updated.offering.timezone));
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work");
    } finally {
      setBusy(null);
    }
  }

  async function openRefund() {
    if (!booking?.order) return;
    try {
      setRefundOrder(await adminOrderApi.get(booking.order.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the order");
    }
  }

  if (!booking) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = booking.status === "CONFIRMED" || booking.status === "PAID_UNSCHEDULED";
  const started = new Date(booking.startsAt) <= new Date();

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/mentorship" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> One-to-one calls
      </Link>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{booking.attendeeName}</h1>
          <BookingStatusBadge status={booking.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {booking.status === "PAID_UNSCHEDULED" ? "Picked (taken before payment cleared): " : ""}
          {booking.whenLabel}
        </p>
      </div>

      {booking.status === "PAID_UNSCHEDULED" && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          This person paid, but their payment cleared after someone else took the time. They have been told you will be in
          touch. Give the call a new time below, or refund it.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Detail label="Email" value={booking.email ?? "—"} />
          <Detail label="WhatsApp" value={booking.whatsappNumber ? `+${booking.whatsappNumber}` : "—"} />
          <Detail label="Preparing for" value={booking.exam} />
          <Detail label="Account name" value={booking.accountName} />
          <Detail
            label="Order"
            value={
              booking.order
                ? `${booking.order.orderNumber} · ${formatMoney(booking.order.totalAmountMinor, booking.order.currency)} · ${booking.order.status}`
                : "—"
            }
          />
          <Detail label="Moved by attendee" value={`${booking.rescheduleCount} time(s)`} />
          <Detail label="Confirmation sent" value={sentLabel(booking.confirmationSentAt)} />
          <Detail label="Link sent" value={sentLabel(booking.meetLinkSentAt)} />
          <Detail label="Reminder sent" value={sentLabel(booking.reminderSentAt)} />
          {booking.cancelReason && <Detail label="Cancelled because" value={booking.cancelReason} />}
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">They want to discuss</p>
            <p className="whitespace-pre-wrap">{booking.notes || "—"}</p>
          </div>
        </CardContent>
      </Card>

      {booking.status === "CONFIRMED" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Joining link</CardTitle>
            <p className="text-sm text-muted-foreground">
              Saving emails it to {booking.attendeeName}. The reminder before the call waits until a link is here.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={meetUrl}
              onChange={(event) => setMeetUrl(event.target.value)}
              maxLength={500}
            />
            <Button
              disabled={busy !== null || meetUrl.trim() === (booking.meetUrl ?? "")}
              onClick={() =>
                void run("link", () => adminMentorshipApi.setMeetLink(booking.id, meetUrl.trim() || null), "Link saved and emailed")
              }
            >
              {busy === "link" && <Loader2 className="size-4 animate-spin" />}
              Save and email
            </Button>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{booking.status === "PAID_UNSCHEDULED" ? "Give it a time" : "Move the call"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Any future time ({booking.offering.timezone}) — not only advertised slots. It cannot overlap another call.
              The attendee is emailed the new time.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Input type="datetime-local" value={moveTo} onChange={(event) => setMoveTo(event.target.value)} />
            <Button
              disabled={busy !== null || !moveTo}
              onClick={() =>
                void run(
                  "move",
                  () => adminMentorshipApi.reschedule(booking.id, zonedLocalToIso(moveTo, booking.offering.timezone)),
                  "Moved, and the attendee has been emailed",
                )
              }
            >
              {busy === "move" && <Loader2 className="size-4 animate-spin" />}
              {booking.status === "PAID_UNSCHEDULED" ? "Confirm this time" : "Move"}
            </Button>
          </CardContent>
        </Card>
      )}

      {(booking.status === "CONFIRMED" || booking.status === "COMPLETED" || booking.status === "NO_SHOW") && started && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How did it go?</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              variant={booking.status === "COMPLETED" ? "default" : "outline"}
              disabled={busy !== null}
              onClick={() => void run("done", () => adminMentorshipApi.setStatus(booking.id, "COMPLETED"), "Marked completed")}
            >
              Completed
            </Button>
            <Button
              variant={booking.status === "NO_SHOW" ? "default" : "outline"}
              disabled={busy !== null}
              onClick={() => void run("noshow", () => adminMentorshipApi.setStatus(booking.id, "NO_SHOW"), "Marked no-show")}
            >
              No-show
            </Button>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cancel or refund</CardTitle>
            <p className="text-sm text-muted-foreground">
              Refunding returns the money and cancels the call by itself (the attendee gets the refund email). Cancel
              without a refund only when the money is being handled another way.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {booking.order?.status === "PAID" && (
              <Button variant="outline" disabled={!refundsEnabled} onClick={() => void openRefund()}>
                <RotateCcw className="size-4" /> Refund {formatMoney(booking.order.totalAmountMinor, booking.order.currency)}
              </Button>
            )}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label htmlFor="cancel-reason">Cancel without refund — reason (optional)</Label>
              <Textarea
                id="cancel-reason"
                rows={2}
                maxLength={300}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <Switch checked={notify} onCheckedChange={(checked: boolean) => setNotify(checked)} />
                <Label className="text-sm font-medium">Email the attendee</Label>
              </div>
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "cancel",
                    () => adminMentorshipApi.setStatus(booking.id, "CANCELLED", cancelReason.trim() || undefined, notify),
                    "Cancelled",
                  )
                }
              >
                {busy === "cancel" && <Loader2 className="size-4 animate-spin" />}
                Cancel without refund
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <RefundDialog order={refundOrder} onClose={() => setRefundOrder(null)} onRefunded={load} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words">{value}</p>
    </div>
  );
}
