"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminApi, type AdminSession, type SessionInput } from "@/lib/api/admin";
import type { ProductListItem } from "@/lib/api/types";

/** Sessions are announced in IST; the picker edits IST wall-clock time whatever the admin's own zone. */
function toIstInput(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 330 * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function fromIstInput(value: string): string {
  return `${value}:00+05:30`;
}

const HUNDRED = BigInt(100);
const ZERO = BigInt(0);

/** "99" or "99.50" rupees → "9900" paise, without a float. */
function rupeesToPaise(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return `${BigInt(whole || "0") * HUNDRED + BigInt((fraction + "00").slice(0, 2))}`;
}

function paiseToRupees(value: string | null): string {
  if (!value) return "";
  const paise = BigInt(value);
  const rest = paise % HUNDRED;
  return rest === ZERO ? `${paise / HUNDRED}` : `${paise / HUNDRED}.${rest.toString().padStart(2, "0")}`;
}

/**
 * Creating and editing a live session. Everything the main website shows about
 * the session comes from here — nothing needs a deploy to announce the next one.
 */
export function SessionForm({
  session,
  onSubmit,
}: {
  session?: AdminSession;
  onSubmit: (input: SessionInput) => Promise<void>;
}) {
  const [values, setValues] = useState({
    title: session?.title ?? "",
    tagline: session?.tagline ?? "",
    description: session?.description ?? "",
    startsAt: session ? toIstInput(session.startsAt) : "",
    durationMinutes: String(session?.durationMinutes ?? 90),
    platformLabel: session?.platformLabel ?? "Live on Zoom · Link sent on mail",
    capacity: session?.capacity ? String(session.capacity) : "",
    price: paiseToRupees(session?.priceAmountMinor ?? null),
    compareAt: paiseToRupees(session?.compareAtAmountMinor ?? null),
    joinUrl: session?.joinUrl ?? "",
    recordingUrl: session?.recordingUrl ?? "",
    highlights: (session?.highlights ?? []).join("\n"),
    perkText: session?.perkText ?? "",
  });
  const [included, setIncluded] = useState<string[]>(session?.included.map((p) => p.id) ?? []);
  const [pdfs, setPdfs] = useState<ProductListItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi
      .listProducts({ status: "PUBLISHED" })
      .then((result) => setPdfs(result.items))
      .catch(() => toast.error("Could not load PDFs to include"));
  }, []);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const price = rupeesToPaise(values.price);
    if (!price || price === "0") {
      toast.error("Sessions are paid — enter a price above ₹0.");
      return;
    }
    if (!values.startsAt) {
      toast.error("Choose when the session starts.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        title: values.title.trim(),
        tagline: values.tagline.trim(),
        description: values.description.trim() || undefined,
        startsAt: fromIstInput(values.startsAt),
        durationMinutes: Number(values.durationMinutes),
        platformLabel: values.platformLabel.trim(),
        capacity: values.capacity ? Number(values.capacity) : null,
        priceAmountMinor: price,
        compareAtAmountMinor: rupeesToPaise(values.compareAt),
        joinUrl: values.joinUrl.trim() || null,
        recordingUrl: values.recordingUrl.trim() || null,
        highlights: values.highlights
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        perkText: values.perkText.trim() || null,
        includedProductIds: included,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>What it is</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Title">
            <Input value={values.title} onChange={set("title")} required maxLength={200} />
          </Field>
          <Field label="Tagline" hint="One line under the title on the website.">
            <Textarea value={values.tagline} onChange={set("tagline")} required maxLength={300} rows={2} />
          </Field>
          <Field label="What you'll learn" hint="One point per line, in display order.">
            <Textarea value={values.highlights} onChange={set("highlights")} rows={6} />
          </Field>
          <Field label="Perk line" hint="Shown in the session card, e.g. the free planner.">
            <Input value={values.perkText} onChange={set("perkText")} maxLength={300} />
          </Field>
          <div className="grid gap-2">
            <Label>Included with a seat</Label>
            <p className="text-xs text-muted-foreground">
              Granted free to everyone who pays; appears in their store library.
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {pdfs.length === 0 && <p className="text-xs text-muted-foreground">No published PDFs.</p>}
              {pdfs.map((pdf) => (
                <label key={pdf.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={included.includes(pdf.id)}
                    onChange={(event) =>
                      setIncluded((current) =>
                        event.target.checked ? [...current, pdf.id] : current.filter((id) => id !== pdf.id),
                      )
                    }
                  />
                  {pdf.title}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>When, where, how much</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts at (IST)">
              <Input type="datetime-local" value={values.startsAt} onChange={set("startsAt")} required />
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" min={5} max={720} value={values.durationMinutes} onChange={set("durationMinutes")} required />
            </Field>
            <Field label="Platform" className="sm:col-span-2">
              <Input value={values.platformLabel} onChange={set("platformLabel")} required maxLength={160} />
            </Field>
            <Field label="Price (₹)">
              <Input inputMode="decimal" value={values.price} onChange={set("price")} placeholder="99" required />
            </Field>
            <Field label="Struck-through price (₹)" hint="Optional.">
              <Input inputMode="decimal" value={values.compareAt} onChange={set("compareAt")} placeholder="499" />
            </Field>
            <Field label="Seats" hint="Blank = unlimited." className="sm:col-span-2">
              <Input type="number" min={1} value={values.capacity} onChange={set("capacity")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field
              label="Joining link"
              hint="Private. Emailed to seat holders on payment (if set) and in the reminder before the start. Reminders wait until this is filled in."
            >
              <Input value={values.joinUrl} onChange={set("joinUrl")} placeholder="https://zoom.us/j/…" />
            </Field>
            <Field label="Recording link" hint="Shown on the website after the session.">
              <Input value={values.recordingUrl} onChange={set("recordingUrl")} placeholder="https://youtube.com/…" />
            </Field>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="justify-self-end">
          {saving && <Loader2 className="size-4 animate-spin" />}
          {session ? "Save changes" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
