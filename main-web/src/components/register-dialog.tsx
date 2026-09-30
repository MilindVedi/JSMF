"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, FileText, Library, Loader2, Send, Stethoscope, X } from "lucide-react";
import { z } from "zod";
import { Button, buttonVariants } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { googleAuth } from "@/lib/api/auth";
import { sessionsApi } from "@/lib/api/sessions";
import type { LiveSession } from "@/lib/api/types";
import { dateLabel, formatMoney, timeLabel } from "@/lib/format";
import { links } from "@/lib/site-content";
import { useSessionCheckout } from "@/lib/use-session-checkout";
import { useSessionStore } from "@/store/session-store";

/** Fallbacks if the options request fails; the API validates against its own list either way. */
const DEFAULT_EXAMS = ["NEET-PG", "INI-CET", "FMGE", "MBBS Professional"];
const DEFAULT_STAGES = ["1st / 2nd year", "3rd year", "Final year", "Intern", "Repeater"];

const schema = z.object({
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{10,18}$/, "Enter a valid WhatsApp number"),
  exam: z.string().min(1, "Choose the exam you're preparing for"),
  stage: z.string().min(1, "Select where you are right now"),
});

type FieldKey = keyof z.infer<typeof schema>;
type Stage = "loading" | "form" | "already" | "done" | "pending";

/**
 * Reserving a seat: sign in, answer three questions, pay.
 *
 * An account comes first, and the dialog says why rather than just demanding
 * one: the free planner is added to the account's library, and the joining
 * link goes to its email. Asking for an email in a form instead would put the
 * planner somewhere the person may never be able to sign in to.
 */
export function RegisterDialog({
  open,
  onClose,
  session,
}: {
  open: boolean;
  onClose: () => void;
  session: LiveSession;
}) {
  const { user, ready } = useSessionStore();
  const { pay, busy } = useSessionCheckout();

  const [stage, setStage] = useState<Stage>("loading");
  const [form, setForm] = useState({ whatsappNumber: "", exam: "", stage: "" });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState("");
  const [options, setOptions] = useState({ exams: DEFAULT_EXAMS, stages: DEFAULT_STAGES });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    sessionsApi
      .options()
      .then(setOptions)
      .catch(() => undefined);
  }, [open]);

  // Once signed in, find out whether they already hold a seat, and prefill
  // answers from an earlier attempt that was abandoned at the payment step.
  useEffect(() => {
    if (!open || !ready || !user) return;
    let cancelled = false;

    sessionsApi
      .mine(session.id)
      .then((mine) => {
        if (cancelled) return;
        if (mine.answers) setForm(mine.answers);
        setStage(mine.registered ? "already" : "form");
      })
      .catch(() => !cancelled && setStage("form"));

    return () => {
      cancelled = true;
    };
  }, [open, ready, user, session.id]);

  if (!open) return null;

  const price = formatMoney(session.priceAmountMinor, session.currency);
  const planner = session.included[0]?.title;

  const set = (key: FieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as FieldKey] = issue.message;
      setErrors(next);
      return;
    }

    const outcome = await pay(session, parsed.data, { name: user!.name, email: user!.email });

    if (outcome.status === "paid") setStage("done");
    else if (outcome.status === "pending-confirmation") {
      setPendingMessage(outcome.message);
      setStage("pending");
    } else if (outcome.status === "failed") setFailure(outcome.message);
  };

  const signedOut = ready && !user;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-overlay p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label="Reserve your seat"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card shadow-editorial">
        <button
          onClick={onClose}
          aria-label="Close registration"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={18} />
        </button>

        {!ready || (user && stage === "loading") ? (
          <div className="grid min-h-64 place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : signedOut ? (
          <div className="px-7 py-8">
            <Heading session={session} />
            <div className="mt-6 flex gap-3 rounded-2xl bg-accent p-4">
              <FileText size={18} className="mt-0.5 shrink-0 text-primary" />
              <div className="text-sm leading-relaxed text-accent-foreground">
                <p className="font-semibold">Sign up is required to register.</p>
                <p className="mt-1">
                  {planner
                    ? `Your free PDF, ${planner}, is given only to the email you sign up with, and your joining link is sent there too.`
                    : "Your confirmation and joining link are sent to the email you sign up with."}
                </p>
              </div>
            </div>
            <GoogleButton
              label="Continue with Google"
              className="mt-6 w-full"
              onClick={() => googleAuth.start("/?register=1")}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              One tap, no password. You come straight back here to finish.
            </p>
          </div>
        ) : stage === "already" ? (
          <Result
            title="You already have a seat"
            body={`Your confirmation and the joining link are in ${user?.email ?? "your email"}.`}
            planner={planner}
            onClose={onClose}
          />
        ) : stage === "done" ? (
          <Result
            title="Your seat is reserved"
            body={`We've emailed your confirmation to ${user?.email}. The joining link arrives by email before the session, along with a reminder.`}
            planner={planner}
            onClose={onClose}
          />
        ) : stage === "pending" ? (
          <Result title="Payment received" body={pendingMessage} planner={planner} onClose={onClose} icon="clock" />
        ) : (
          <form onSubmit={submit} className="px-7 py-8" noValidate>
            <Heading session={session} />

            <p className="mt-5 rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
              Registering as <span className="font-semibold text-foreground">{user?.name}</span> ·{" "}
              {user?.email}
            </p>

            <div className="mt-5 grid gap-4">
              <label className="field-label">
                WhatsApp number
                <input
                  className="field"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.whatsappNumber}
                  maxLength={18}
                  onChange={(event) => set("whatsappNumber", event.target.value)}
                  placeholder="+91 98765 43210"
                />
                <span className="text-[11px] font-medium text-muted-foreground">
                  Used only for this session.
                </span>
                {errors.whatsappNumber && (
                  <span className="text-xs font-medium text-destructive">{errors.whatsappNumber}</span>
                )}
              </label>

              <ChipGroup
                label="Preparing for"
                values={options.exams}
                selected={form.exam}
                onSelect={(value) => set("exam", value)}
                error={errors.exam}
              />
              <ChipGroup
                label="Current stage"
                values={options.stages}
                selected={form.stage}
                onSelect={(value) => set("stage", value)}
                error={errors.stage}
              />
            </div>

            {failure && (
              <p className="mt-5 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {failure}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-7 w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Opening payment…
                </>
              ) : (
                `Pay ${price} & reserve my seat`
              )}
            </Button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              Secure payment by Razorpay.{planner ? ` ${planner} included.` : ""} We never share your details.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Heading({ session }: { session: LiveSession }) {
  return (
    <>
      <div className="flex items-center gap-2 text-primary">
        <Stethoscope size={17} />
        <span className="text-[11px] font-bold uppercase tracking-wide">Reserve your seat</span>
      </div>
      <h2 className="mt-3 pr-8 font-display text-2xl font-semibold leading-tight text-brand-deep">
        {session.title}
      </h2>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">
        {dateLabel(session.startsAt)} · {timeLabel(session.startsAt, session.durationMinutes)}
      </p>
    </>
  );
}

function ChipGroup({
  label,
  values,
  selected,
  onSelect,
  error,
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="field-label" role="group" aria-label={label}>
      {label}
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={selected === value}
            onClick={() => onSelect(value)}
            className={`filter-chip ${selected === value ? "filter-chip-active" : ""}`}
          >
            {value}
          </button>
        ))}
      </div>
      {error && <span className="text-xs font-medium text-destructive">{error}</span>}
    </div>
  );
}

function Result({
  title,
  body,
  planner,
  onClose,
  icon = "check",
}: {
  title: string;
  body: string;
  planner?: string;
  onClose: () => void;
  icon?: "check" | "clock";
}) {
  return (
    <div className="px-7 py-12 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-success">
        {icon === "check" ? <CheckCircle2 size={28} /> : <Clock size={28} className="text-primary" />}
      </div>
      <h2 className="mt-5 font-display text-2xl font-semibold text-brand-deep">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-7 flex flex-col gap-2">
        {planner && (
          <a href={`${links.store}/library`} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg" })}>
            <Library size={16} /> Open {planner}
          </a>
        )}
        <a
          href={links.telegram}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: planner ? "secondary" : "primary", size: "lg" })}
        >
          <Send size={16} /> Join the Telegram channel
        </a>
        <Button variant="ghost" onClick={onClose}>
          Back to the page
        </Button>
      </div>
    </div>
  );
}
