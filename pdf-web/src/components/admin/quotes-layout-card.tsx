"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  adminSessionApi,
  type NoSessionTestimonials,
  type QuoteLayout,
} from "@/lib/api/admin";
import { mainWebsiteHost } from "@/lib/site-content";
import { errorText } from "./feedback-forms/shared";

const CHOICES: Array<{
  value: QuoteLayout;
  title: string;
  detail: string;
  picture: string[];
}> = [
  {
    value: "SCROLL",
    title: "One row that scrolls sideways",
    detail:
      "Two or three replies in view, with the next one part way in and arrows on wider screens. However many you pick, the band stays the same height.",
    picture: ["▌█ █ █ ▐→"],
  },
  {
    value: "GRID",
    title: "A block over several lines",
    detail:
      "Two or three across, wrapping onto as many lines as it takes, with nothing to scroll. Every reply is on the page at once, so the band grows as you pick more.",
    picture: ["█ █ █", "█ █ █"],
  },
];

/**
 * How the written replies are laid out wherever the website shows them: the
 * band between sessions and each session's own feedback sections alike, so
 * the two never disagree.
 *
 * Shares the one settings row with NoSessionTestimonialsCard; each card sends
 * only the fields it owns, so neither overwrites the other.
 */
export function QuotesLayoutCard() {
  const [settings, setSettings] = useState<NoSessionTestimonials | null>(null);
  const [choice, setChoice] = useState<QuoteLayout>("SCROLL");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminSessionApi
      .noSessionTestimonials()
      .then((loaded) => {
        setSettings(loaded);
        setChoice(loaded.quotesLayout);
      })
      .catch((error: unknown) =>
        toast.error(errorText(error, "Could not load this setting")),
      );
  }, []);

  if (!settings) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const dirty = choice !== settings.quotesLayout;

  async function save() {
    setSaving(true);
    try {
      const saved = await adminSessionApi.updateNoSessionTestimonials({
        quotesLayout: choice,
      });
      setSettings(saved);
      setChoice(saved.quotesLayout);
      toast.success("Saved");
    } catch (error) {
      toast.error(errorText(error, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>How student replies are laid out</CardTitle>
        <CardDescription>
          Applies everywhere {mainWebsiteHost} shows written replies: the band
          between sessions, and each session&apos;s own feedback sections.
          Screenshots always sit in a row that scrolls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map((option) => {
            const picked = choice === option.value;
            return (
              <label
                key={option.value}
                // Tied to the input by id, so a click anywhere on the card
                // picks it — wrapping the input alone does not always do that.
                htmlFor={`quotes-layout-${option.value}`}
                className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${
                  picked ? "border-primary bg-accent/50" : "hover:bg-accent/30"
                }`}
              >
                <input
                  type="radio"
                  id={`quotes-layout-${option.value}`}
                  name="quotes-layout"
                  className="mt-1"
                  checked={picked}
                  disabled={saving}
                  onChange={() => setChoice(option.value)}
                />
                <span className="space-y-1.5">
                  <span className="block text-sm font-medium">
                    {option.title}
                  </span>
                  <span
                    aria-hidden
                    className="block font-mono text-sm leading-tight tracking-widest text-primary/70"
                  >
                    {option.picture.map((line, row) => (
                      <span key={row} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {option.detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => setChoice(settings.quotesLayout)}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
