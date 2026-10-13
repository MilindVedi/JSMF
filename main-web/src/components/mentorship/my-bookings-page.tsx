"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Loader2, Video } from "lucide-react";
import { SiteLayout } from "@/components/site";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { mentorshipApi, type MyBooking, type MyBookingStatus, type OpenSlot } from "@/lib/api/mentorship";
import { supportEmail } from "@/lib/site-content";
import { useSessionStore } from "@/store/session-store";
import { SlotPicker, slotSummary } from "./slot-picker";

const STATUS: Record<MyBookingStatus, { label: string; className: string }> = {
  CONFIRMED: { label: "Confirmed", className: "bg-emerald-100 text-emerald-800" },
  PAID_UNSCHEDULED: { label: "We'll set a new time", className: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "Completed", className: "bg-muted text-muted-foreground" },
  NO_SHOW: { label: "Missed", className: "bg-muted text-muted-foreground" },
  CANCELLED: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

/** /mentorship/bookings — the signed-in person's one-to-one calls. */
export function MyBookingsPage() {
  const { user, ready, restore } = useSessionStore();
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);

  useEffect(() => {
    void restore();
  }, [restore]);

  const load = useCallback(() => {
    mentorshipApi
      .mine()
      .then(setBookings)
      .catch(() => setBookings([]));
  }, []);

  useEffect(() => {
    if (ready && user) load();
  }, [ready, user, load]);

  const replace = (updated: MyBooking) =>
    setBookings((current) => current?.map((b) => (b.id === updated.id ? updated : b)) ?? null);

  return (
    <SiteLayout>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="font-display text-2xl font-semibold text-brand-deep sm:text-3xl">My one-to-one calls</h1>

        {!ready || (user && bookings === null) ? (
          <div className="grid min-h-48 place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !user ? (
          <div className="mt-8 rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Sign in to see your bookings.</p>
            <Link
              href={`/account/login?next=${encodeURIComponent("/mentorship/bookings")}`}
              className={buttonVariants({ className: "mt-6" })}
            >
              Sign in
            </Link>
          </div>
        ) : bookings!.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">You have not booked a call yet.</p>
            <Link href="/mentorship" className={buttonVariants({ className: "mt-6" })}>
              Book a 1:1 session
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {bookings!.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onChanged={replace} />
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}

function BookingCard({ booking, onChanged }: { booking: MyBooking; onChanged: (b: MyBooking) => void }) {
  const [moving, setMoving] = useState(false);
  const [slots, setSlots] = useState<OpenSlot[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const status = STATUS[booking.status];
  const upcoming = new Date(booking.endsAt) > new Date();
  const zone = booking.offering.timezone;

  function startMoving() {
    setMoving(true);
    setMessage(null);
    setSlots(null);
    mentorshipApi
      .rescheduleSlots(booking.id)
      .then((list) => setSlots(list.slots))
      .catch((error: unknown) => {
        setSlots([]);
        setMessage(error instanceof Error ? error.message : "Could not load open times.");
      });
  }

  async function confirmMove() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await mentorshipApi.reschedule(booking.id, selected);
      onChanged(updated);
      setMoving(false);
      setSelected(null);
      setMessage("Moved. We've emailed you the new time.");
    } catch (error) {
      setMessage(error instanceof ApiError || error instanceof Error ? error.message : "Could not move the call.");
      if (error instanceof ApiError && error.status === 409) startMoving();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="min-w-0 rounded-3xl border border-border bg-card p-5 shadow-editorial sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-brand-deep">{booking.offering.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock size={15} /> {booking.whenLabel}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${status.className}`}>
          {status.label}
        </span>
      </div>

      {booking.status === "PAID_UNSCHEDULED" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Your payment arrived just after this time was taken. We&apos;ll contact you to set a new time, or refund you in
          full — or write to {supportEmail}.
        </p>
      )}

      {booking.status === "CONFIRMED" && upcoming && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {booking.meetUrl ? (
            <a href={booking.meetUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm" })}>
              <Video size={15} /> Join on {booking.offering.platformLabel}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">
              The {booking.offering.platformLabel} link will be emailed to you before the call.
            </span>
          )}
          {booking.canReschedule && !moving && (
            <Button size="sm" variant="secondary" onClick={startMoving}>
              Reschedule
            </Button>
          )}
        </div>
      )}

      {booking.status === "CONFIRMED" && upcoming && !booking.canReschedule && booking.rescheduleBlockedReason && (
        <p className="mt-3 text-xs text-muted-foreground">{booking.rescheduleBlockedReason}</p>
      )}

      {moving && (
        <div className="mt-6 space-y-4 border-t border-border pt-6">
          <p className="text-sm font-semibold text-brand-deep">
            Pick a new time
            <span className="ml-2 font-normal text-muted-foreground">
              ({booking.reschedulesLeft} move{booking.reschedulesLeft === 1 ? "" : "s"} left)
            </span>
          </p>
          <SlotPicker
            slots={slots}
            timeZone={zone}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setSelected(null);
            }}
            selected={selected}
            onSelect={setSelected}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!selected || busy} onClick={() => void confirmMove()}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              {selected ? `Move to ${slotSummary(selected, zone)}` : "Choose a time"}
            </Button>
            <Button variant="ghost" onClick={() => setMoving(false)}>
              Keep current time
            </Button>
          </div>
        </div>
      )}

      {message && <p className="mt-4 text-sm font-medium text-foreground">{message}</p>}
    </article>
  );
}
