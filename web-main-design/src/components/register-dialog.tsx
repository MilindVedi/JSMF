import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Send, Stethoscope, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { links, upcomingSession } from "@/lib/jsmf-event";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(80, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{10,15}$/, "Enter a valid WhatsApp number"),
  exam: z.string().min(1, "Choose the exam you're preparing for"),
  year: z.string().min(1, "Select where you are right now"),
});

const exams = ["NEET-PG", "INI-CET", "FMGE", "MBBS Professional"];
const years = ["1st / 2nd year", "3rd year", "Final year", "Intern", "Repeater"];

type FieldKey = "name" | "email" | "phone" | "exam" | "year";

export function RegisterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", exam: "", year: "" });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const set = (k: FieldKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as FieldKey] = issue.message;
      setErrors(next);
      return;
    }
    setState("sending");
    setTimeout(() => setState("done"), 700);
  };


  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-overlay p-4 py-10">
      <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card shadow-editorial">
        <button
          onClick={onClose}
          aria-label="Close registration"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={18} />
        </button>

        {state === "done" ? (
          <div className="px-7 py-12 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-success">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="mt-5 font-display text-2xl font-semibold text-brand-deep">
              Your seat is reserved
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              We'll send the joining link and the free revision planner before the session. Join the
              Telegram channel so you don't miss the reminder.
            </p>
            <div className="mt-7 flex flex-col gap-2">
              <Button asChild size="lg">
                <a href={links.telegram} target="_blank" rel="noreferrer">
                  <Send size={16} /> Join the Telegram channel
                </a>
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Back to the page
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="px-7 py-8">
            <div className="flex items-center gap-2 text-primary">
              <Stethoscope size={17} />
              <span className="text-[11px] font-bold uppercase tracking-wide">
                Reserve your seat
              </span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-brand-deep">
              {upcomingSession.title}
            </h2>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {upcomingSession.dateLabel} · {upcomingSession.timeLabel}
            </p>

            <div className="mt-6 grid gap-4">
              <label className="field-label">
                Full name
                <input
                  className="field"
                  value={form.name}
                  maxLength={80}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Dr. / Mr. / Ms."
                />
                {errors.name && <span className="text-xs font-medium text-destructive">{errors.name}</span>}
              </label>

              <label className="field-label">
                Email address
                <input
                  className="field"
                  type="email"
                  value={form.email}
                  maxLength={255}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                />
                {errors.email && <span className="text-xs font-medium text-destructive">{errors.email}</span>}
              </label>

              <label className="field-label">
                WhatsApp number
                <input
                  className="field"
                  inputMode="tel"
                  value={form.phone}
                  maxLength={15}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                />
                <span className="text-[11px] font-medium text-muted-foreground">
                  Used only to send the joining link and reminder.
                </span>
                {errors.phone && <span className="text-xs font-medium text-destructive">{errors.phone}</span>}
              </label>

              <div className="field-label">
                Preparing for
                <div className="flex flex-wrap gap-2">
                  {exams.map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => set("exam", x)}
                      className={`filter-chip ${form.exam === x ? "filter-chip-active" : ""}`}
                    >
                      {x}
                    </button>
                  ))}
                </div>
                {errors.exam && <span className="text-xs font-medium text-destructive">{errors.exam}</span>}
              </div>

              <div className="field-label">
                Current stage
                <div className="flex flex-wrap gap-2">
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => set("year", y)}
                      className={`filter-chip ${form.year === y ? "filter-chip-active" : ""}`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
                {errors.year && <span className="text-xs font-medium text-destructive">{errors.year}</span>}
              </div>
            </div>

            <Button type="submit" size="lg" className="mt-7 w-full" disabled={state === "sending"}>
              {state === "sending" ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Reserving…
                </>
              ) : (
                "Confirm my seat"
              )}
            </Button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              Free to attend. We never share your details.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
