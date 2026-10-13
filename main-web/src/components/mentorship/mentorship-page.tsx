"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarCheck, CheckCircle2, Clock, Loader2, ShieldCheck, Sparkles, Video } from "lucide-react";
import { PhoneField } from "@/components/phone-field";
import { SiteLayout } from "@/components/site";
import { TelegramFloat } from "@/components/telegram-float";
import { Button, buttonVariants } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { track } from "@/lib/analytics";
import { accountApi, googleAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { currentOffering, mentorshipApi, type MentorshipOffering, type OpenSlot } from "@/lib/api/mentorship";
import { formatMoney } from "@/lib/format";
import { EMPTY_PHONE, phoneFromStored, validatePhone, type PhoneValue } from "@/lib/phone";
import { completeCheckout } from "@/lib/razorpay-checkout";
import { credentials, supportEmail } from "@/lib/site-content";
import { useSessionStore } from "@/store/session-store";
import { dayKey, SlotPicker, slotSummary } from "./slot-picker";

/** Fallback if the options request fails; the API validates against its own list either way. */
const DEFAULT_EXAMS = ["NEET-PG", "INI-CET", "FMGE", "MBBS Professional"];

type Errors = Partial<Record<"slot" | "name" | "phone" | "exam", string>>;
type Stage = { kind: "form" } | { kind: "done"; when: string } | { kind: "pending"; message: string };

/**
 * /mentorship — a private call with Dr. Angad, booked and paid in one place.
 *
 * Pick a time, sign in (one tap with Google), confirm the details, pay. The
 * server decides everything that matters: the price, whether the time is
 * really open, and holding it while the payment happens.
 */
export function MentorshipPage() {
  const params = useSearchParams();
  const { user, ready, restore } = useSessionStore();

  const [offering, setOffering] = useState<MentorshipOffering | null | undefined>(undefined);
  const [slots, setSlots] = useState<OpenSlot[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState<PhoneValue>(EMPTY_PHONE);
  const [exam, setExam] = useState("");
  const [notes, setNotes] = useState("");
  const [exams, setExams] = useState(DEFAULT_EXAMS);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "form" });

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    void currentOffering().then(setOffering);
    mentorshipApi
      .options()
      .then((o) => setExams(o.exams))
      .catch(() => undefined);
  }, []);

  const wantedSlot = params.get("slot");

  /**
   * Loads the open times. On the first load it also restores the time picked
   * before leaving for Google sign-in (carried in `?slot=`), if still open.
   */
  const loadSlots = useCallback(
    (target: MentorshipOffering, restoreWanted: boolean) => {
      mentorshipApi
        .slots(target.slug)
        .then((list) => {
          setSlots(list.slots);
          if (restoreWanted && wantedSlot && list.slots.some((slot) => slot.startsAt === wantedSlot)) {
            setSelectedDate(dayKey(wantedSlot, target.timezone));
            setSelected(wantedSlot);
          }
        })
        .catch(() => setSlots([]));
    },
    [wantedSlot],
  );

  useEffect(() => {
    if (offering) loadSlots(offering, true);
  }, [offering, loadSlots]);

  // Prefill from the account: the name, and the number and exam it gave at signup.
  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    accountApi
      .profile()
      .then((profile) => {
        if (cancelled) return;
        setName((current) => current || profile.name || user.name || "");
        if (profile.mobileE164 || profile.mobileNumber) {
          setPhone((current) =>
            current.national ? current : phoneFromStored(profile.mobileE164 ?? `91${profile.mobileNumber}`),
          );
        }
        if (profile.preparingFor) setExam((current) => current || profile.preparingFor || "");
      })
      .catch(() => !cancelled && setName((current) => current || user.name || ""));
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const returnTo = `/mentorship${selected ? `?slot=${encodeURIComponent(selected)}` : ""}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!offering || !user) return;
    setFailure(null);

    const next: Errors = {};
    if (!selected) next.slot = "Pick a date and time first.";
    if (name.trim().length < 2) next.name = "Enter your full name";
    const checkedPhone = validatePhone(phone);
    if (checkedPhone.error) next.phone = checkedPhone.error;
    if (!exam) next.exam = "Choose what you're preparing for";
    setErrors(next);
    if (Object.keys(next).length > 0 || !selected || !checkedPhone.e164) return;

    setBusy(true);
    try {
      const order = await mentorshipApi.hold(offering.slug, {
        startsAt: selected,
        attendeeName: name.trim(),
        whatsappNumber: checkedPhone.e164,
        exam,
        notes: notes.trim() || undefined,
      });
      const when = slotSummary(selected, offering.timezone);
      const outcome = await completeCheckout(order, {
        description: `${offering.title} · ${when}`,
        buyer: { name: name.trim(), email: user.email, contact: checkedPhone.e164 },
        pendingMessage:
          "Your payment went through but we could not confirm it here. " +
          "Your booking will be confirmed by email within a few minutes.",
      });

      if (outcome.status === "paid") setStage({ kind: "done", when });
      else if (outcome.status === "pending-confirmation") setStage({ kind: "pending", message: outcome.message });
      else if (outcome.status === "failed") setFailure(outcome.message);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Someone else took it a moment ago: show the times as they are now.
        setFailure(error.message);
        setSelected(null);
        setSlots(null);
        loadSlots(offering, false);
      } else {
        setFailure(error instanceof Error ? error.message : "Could not start the payment.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (offering === undefined) {
    return (
      <SiteLayout>
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </SiteLayout>
    );
  }

  if (offering === null) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <h1 className="font-display text-3xl font-semibold text-brand-deep">One-to-one calls are not open right now</h1>
          <p className="mt-4 text-muted-foreground">Please check back soon, or write to us at {supportEmail}.</p>
          <Link href="/" className={buttonVariants({ className: "mt-8" })}>
            Back to home
          </Link>
        </div>
      </SiteLayout>
    );
  }

  const cutoffHours = Math.round(offering.rescheduleCutoffMinutes / 60);

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 lg:grid-cols-12 lg:px-8 lg:py-20">
          <div className="lg:col-span-7">
            <span className="eyebrow">
              <Sparkles size={13} /> One-to-one mentorship
            </span>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] text-brand-deep md:text-5xl">
              {offering.title}
            </h1>
            {offering.subtitle && (
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{offering.subtitle}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {credentials.map((item) => (
                <span key={item} className="credential-chip">
                  {item}
                </span>
              ))}
            </div>
            {offering.highlights.length > 0 && (
              <ul className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {offering.highlights.map((item) => (
                  <li key={item} className="flex gap-3 text-[15px] leading-snug text-foreground">
                    <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-editorial">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dr-angad-rai.jpg"
                alt="Dr. Angad Rai"
                width={800}
                height={1000}
                className="aspect-[4/3] w-full object-cover object-top"
              />
              <div className="flex items-end justify-between gap-4 p-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Per session</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-semibold text-brand-deep">
                      {formatMoney(offering.priceAmountMinor, offering.currency)}
                    </span>
                    {offering.compareAtAmountMinor && (
                      <span className="text-base text-muted-foreground line-through">
                        {formatMoney(offering.compareAtAmountMinor, offering.currency)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="space-y-1 text-right text-sm text-muted-foreground">
                  <p className="flex items-center justify-end gap-1.5">
                    <Clock size={15} /> {offering.durationMinutes} min
                  </p>
                  <p className="flex items-center justify-end gap-1.5">
                    <Video size={15} /> {offering.platformLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Booking */}
      <section id="book" className="bg-background py-16">
        {stage.kind !== "form" ? (
          <div className="mx-auto max-w-xl px-5 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-success">
              {stage.kind === "done" ? <CalendarCheck size={28} /> : <Clock size={28} className="text-primary" />}
            </div>
            <h2 className="mt-5 font-display text-3xl font-semibold text-brand-deep">
              {stage.kind === "done" ? "Your call is booked" : "Payment received"}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              {stage.kind === "done"
                ? `${stage.when} (${offering.durationMinutes} minutes). We've emailed the confirmation to ${user?.email}; the ${offering.platformLabel} link follows before your call.`
                : stage.message}
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/mentorship/bookings" className={buttonVariants({ size: "lg" })}>
                See my bookings
              </Link>
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-12 lg:px-8">
            <div className="lg:col-span-7">
              <h2 className="flex items-center gap-3 font-display text-2xl font-semibold text-brand-deep">
                <StepNumber n={1} /> Pick a date &amp; time
              </h2>
              <div className="mt-6">
                <SlotPicker
                  slots={slots}
                  timeZone={offering.timezone}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setSelected(null);
                  }}
                  selected={selected}
                  onSelect={(startsAt) => {
                    setSelected(startsAt);
                    setErrors((current) => ({ ...current, slot: undefined }));
                  }}
                />
                {errors.slot && <p className="mt-3 text-sm font-medium text-destructive">{errors.slot}</p>}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-border bg-card p-6 shadow-editorial sm:p-7">
                <h2 className="flex items-center gap-3 font-display text-2xl font-semibold text-brand-deep">
                  <StepNumber n={2} /> Your details
                </h2>

                {!ready ? (
                  <div className="grid min-h-48 place-items-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !user ? (
                  <div className="mt-6 space-y-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Sign in to book — your confirmation and the {offering.platformLabel} link are sent to your email, and
                      you can move the call yourself later.
                    </p>
                    <GoogleButton
                      label="Continue with Google"
                      className="w-full"
                      onClick={() => {
                        track("signin_start", { method: "google", from: "mentorship" });
                        googleAuth.start({ next: returnTo });
                      }}
                    />
                    <p className="text-center text-sm text-muted-foreground">
                      Rather use email?{" "}
                      <Link
                        href={`/account/signup?next=${encodeURIComponent(returnTo)}`}
                        onClick={() => track("signin_start", { method: "email", from: "mentorship" })}
                        className="font-semibold text-primary hover:underline"
                      >
                        Create an account
                      </Link>{" "}
                      or{" "}
                      <Link
                        href={`/account/login?next=${encodeURIComponent(returnTo)}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        sign in
                      </Link>
                    </p>
                  </div>
                ) : (
                  <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
                    <p className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
                      <span>
                        Signed in as <span className="font-semibold text-foreground">{user.email}</span>
                      </span>
                      <Link href="/mentorship/bookings" className="font-semibold text-primary hover:underline">
                        My bookings
                      </Link>
                    </p>
                    <label className="field-label">
                      Full name
                      <input
                        className="field"
                        autoComplete="name"
                        value={name}
                        maxLength={120}
                        placeholder="Dr. / Mr. / Ms."
                        onChange={(event) => {
                          setName(event.target.value);
                          setErrors((current) => ({ ...current, name: undefined }));
                        }}
                      />
                      {errors.name && <span className="text-xs font-medium text-destructive">{errors.name}</span>}
                    </label>
                    <PhoneField
                      id="mentorship-whatsapp"
                      label="WhatsApp number"
                      value={phone}
                      onChange={(value) => {
                        setPhone(value);
                        setErrors((current) => ({ ...current, phone: undefined }));
                      }}
                      error={errors.phone}
                    />
                    <div className="field-label" role="group" aria-label="Preparing for">
                      Preparing for
                      <div className="flex flex-wrap gap-2">
                        {exams.map((value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={exam === value}
                            onClick={() => {
                              setExam(value);
                              setErrors((current) => ({ ...current, exam: undefined }));
                            }}
                            className={`filter-chip ${exam === value ? "filter-chip-active" : ""}`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                      {errors.exam && <span className="text-xs font-medium text-destructive">{errors.exam}</span>}
                    </div>
                    <label className="field-label">
                      <span>
                        What would you like to discuss? <span className="font-normal text-muted-foreground">(optional)</span>
                      </span>
                      <textarea
                        className="field min-h-24 resize-y"
                        value={notes}
                        maxLength={1000}
                        placeholder="e.g. My mock scores are stuck at 450, exam in 4 months"
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    </label>

                    <div className="rounded-2xl bg-accent/60 p-4 text-sm">
                      <div className="flex justify-between gap-4 py-1">
                        <span className="text-muted-foreground">Session</span>
                        <span className="text-right font-semibold text-foreground">
                          {selected ? slotSummary(selected, offering.timezone) : "Not selected"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 py-1">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-semibold text-foreground">{offering.durationMinutes} minutes</span>
                      </div>
                      <div className="mt-2 flex justify-between gap-4 border-t border-border pt-3">
                        <span className="font-display text-base font-semibold text-brand-deep">Total</span>
                        <span className="font-display text-base font-semibold text-brand-deep">
                          {formatMoney(offering.priceAmountMinor, offering.currency)}
                        </span>
                      </div>
                    </div>

                    {failure && (
                      <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{failure}</p>
                    )}

                    <Button type="submit" size="lg" className="w-full" disabled={busy}>
                      {busy ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Opening payment…
                        </>
                      ) : (
                        "Continue to payment"
                      )}
                    </Button>
                    <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                      <ShieldCheck size={13} /> Secure payment by Razorpay · Free reschedule up to {cutoffHours}h before
                    </p>
                    <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                      By proceeding with payment, you agree to the JSMF{" "}
                      <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline">
                        Terms &amp; Conditions
                      </Link>{" "}
                      and{" "}
                      <Link href="/refund-policy" target="_blank" className="font-medium text-primary hover:underline">
                        Refund &amp; Cancellation Policy
                      </Link>
                      .
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
      <TelegramFloat />
    </SiteLayout>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
      {n}
    </span>
  );
}
