"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminMentorshipApi, type AdminOffering, type OfferingInput } from "@/lib/api/admin-mentorship";
import { rupeesToMinor } from "@/lib/money";

interface Values {
  title: string;
  subtitle: string;
  description: string;
  price: string;
  compareAt: string;
  durationMinutes: string;
  bufferMinutes: string;
  minNoticeHours: string;
  bookingWindowDays: string;
  rescheduleCutoffHours: string;
  maxReschedules: string;
  platformLabel: string;
  highlights: string[];
}

const DEFAULTS: Values = {
  title: "45 minutes. Just you and Dr. Angad.",
  subtitle:
    "A private call to look at your preparation honestly and leave with a plan that fits your exam date, your hours, and your weak spots.",
  description: "",
  price: "999",
  compareAt: "1499",
  durationMinutes: "45",
  bufferMinutes: "15",
  minNoticeHours: "12",
  bookingWindowDays: "21",
  rescheduleCutoffHours: "24",
  maxReschedules: "2",
  platformLabel: "Google Meet",
  highlights: [
    "A personal review of where you stand right now",
    "A study plan built around your exam date and hours",
    "Answers to your doubts — subjects, strategy, or burnout",
    "Short written summary of next steps after the call",
  ],
};

function fromOffering(o: AdminOffering): Values {
  return {
    title: o.title,
    subtitle: o.subtitle ?? "",
    description: o.description ?? "",
    price: String(Number(o.priceAmountMinor) / 100),
    compareAt: o.compareAtAmountMinor ? String(Number(o.compareAtAmountMinor) / 100) : "",
    durationMinutes: String(o.durationMinutes),
    bufferMinutes: String(o.bufferMinutes),
    minNoticeHours: String(o.minNoticeMinutes / 60),
    bookingWindowDays: String(o.bookingWindowDays),
    rescheduleCutoffHours: String(o.rescheduleCutoffMinutes / 60),
    maxReschedules: String(o.maxReschedules),
    platformLabel: o.platformLabel,
    highlights: o.highlights.length ? o.highlights : [""],
  };
}

function toInput(v: Values): OfferingInput {
  return {
    title: v.title.trim(),
    subtitle: v.subtitle.trim(),
    description: v.description.trim(),
    priceAmountMinor: rupeesToMinor(v.price),
    compareAtAmountMinor: v.compareAt.trim() ? rupeesToMinor(v.compareAt) : null,
    durationMinutes: Number(v.durationMinutes),
    bufferMinutes: Number(v.bufferMinutes),
    minNoticeMinutes: Math.round(Number(v.minNoticeHours) * 60),
    bookingWindowDays: Number(v.bookingWindowDays),
    rescheduleCutoffMinutes: Math.round(Number(v.rescheduleCutoffHours) * 60),
    maxReschedules: Number(v.maxReschedules),
    platformLabel: v.platformLabel.trim(),
    highlights: v.highlights.map((h) => h.trim()).filter(Boolean),
  };
}

/**
 * The offering itself: what the page says, what a call costs, and the rules a
 * booking follows. Creates the offering when there is none yet.
 */
export function OfferingForm({ offering, onSaved }: { offering: AdminOffering | null; onSaved: (o: AdminOffering) => void }) {
  const [values, setValues] = useState<Values>(offering ? fromOffering(offering) : DEFAULTS);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (Number(values.price) < 1) {
      toast.error("A one-to-one call must cost at least ₹1.");
      return;
    }
    setBusy(true);
    try {
      const saved = offering
        ? await adminMentorshipApi.update(offering.id, toInput(values))
        : await adminMentorshipApi.create(toInput(values));
      toast.success(offering ? "Saved" : "Created as a draft — add weekly hours, then publish.");
      onSaved(saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const number = (key: keyof Values, label: string, hint: string, step = "1") => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} type="number" min="0" step={step} value={values[key] as string} onChange={set(key)} required />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Page and price</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Heading</Label>
            <Input id="title" value={values.title} onChange={set("title")} maxLength={200} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subtitle">Line under the heading</Label>
            <Textarea id="subtitle" value={values.subtitle} onChange={set("subtitle")} maxLength={300} rows={2} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {number("price", "Price (₹)", "What a call costs.", "0.01")}
            <div className="space-y-1.5">
              <Label htmlFor="compareAt">Was price (₹, optional)</Label>
              <Input id="compareAt" type="number" min="0" step="0.01" value={values.compareAt} onChange={set("compareAt")} />
              <p className="text-xs text-muted-foreground">Shown struck through. Leave empty for none.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>What they get</Label>
            {values.highlights.map((highlight, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={highlight}
                  maxLength={200}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      highlights: current.highlights.map((h, i) => (i === index ? event.target.value : h)),
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove"
                  onClick={() =>
                    setValues((current) => ({ ...current, highlights: current.highlights.filter((_, i) => i !== index) }))
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            {values.highlights.length < 12 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setValues((current) => ({ ...current, highlights: [...current.highlights, ""] }))}
              >
                <Plus className="size-4" /> Add a point
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {number("durationMinutes", "Call length (minutes)", "Changing it affects new bookings only.")}
          {number("bufferMinutes", "Gap after each call (minutes)", "Kept free between calls.")}
          {number("minNoticeHours", "Minimum notice (hours)", "The earliest bookable time is at least this far away.", "0.5")}
          {number("bookingWindowDays", "Book up to (days ahead)", "How far ahead slots are offered.")}
          {number("rescheduleCutoffHours", "Self-reschedule until (hours before)", "After this, they must contact support.", "0.5")}
          {number("maxReschedules", "Self-reschedules allowed", "Per booking. You can always move a call yourself.")}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="platformLabel">Where the call happens</Label>
            <Input id="platformLabel" value={values.platformLabel} onChange={set("platformLabel")} maxLength={160} required />
            <p className="text-xs text-muted-foreground">Display text, e.g. &ldquo;Google Meet&rdquo;. The link is added per booking.</p>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {offering ? "Save changes" : "Create offering"}
      </Button>
    </form>
  );
}
