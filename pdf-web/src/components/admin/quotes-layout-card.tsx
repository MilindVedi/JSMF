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
  type QuoteExpand,
  type QuoteLayout,
} from "@/lib/api/admin";
import { mainWebsiteHost } from "@/lib/site-content";
import { errorText } from "./feedback-forms/shared";

interface Choice<T extends string> {
  value: T;
  title: string;
  detail: string;
  picture: string[];
}

const LAYOUTS: Choice<QuoteLayout>[] = [
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
    picture: ["█ █ █", "█ █"],
  },
];

const EXPANDS: Choice<QuoteExpand>[] = [
  {
    value: "POPUP",
    title: "Open it in a pop-up",
    detail:
      "The whole reply opens over the page, and scrolls on its own if it is long. The cards keep their size, so the row never jumps.",
    picture: ["█ ▢ █"],
  },
  {
    value: "INLINE",
    title: "Grow the card in place",
    detail:
      'That card gets taller to show the whole reply, with "Show less" to fold it back. The cards beside it grow too, so the names stay in one line. A very long reply makes the whole row tall.',
    picture: ["█ █ █", "  █  "],
  },
];

/**
 * How the written replies look wherever the website shows them — the band
 * between sessions and each session's own feedback sections alike, so the
 * two never disagree: how the cards are laid out, and what "Read more" does.
 *
 * Shares the one settings row with NoSessionTestimonialsCard; each card sends
 * only the fields it owns, so neither overwrites the other.
 */
export function QuotesLayoutCard() {
  const [settings, setSettings] = useState<NoSessionTestimonials | null>(null);
  const [layout, setLayout] = useState<QuoteLayout>("SCROLL");
  const [expand, setExpand] = useState<QuoteExpand>("POPUP");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminSessionApi
      .noSessionTestimonials()
      .then((loaded) => {
        setSettings(loaded);
        setLayout(loaded.quotesLayout);
        setExpand(loaded.quotesExpand);
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

  const dirty =
    layout !== settings.quotesLayout || expand !== settings.quotesExpand;

  async function save() {
    setSaving(true);
    try {
      const saved = await adminSessionApi.updateNoSessionTestimonials({
        quotesLayout: layout,
        quotesExpand: expand,
      });
      setSettings(saved);
      setLayout(saved.quotesLayout);
      setExpand(saved.quotesExpand);
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
      <CardContent className="space-y-6">
        <ChoiceGroup
          name="quotes-layout"
          label="Layout"
          choices={LAYOUTS}
          value={layout}
          disabled={saving}
          onChange={setLayout}
        />
        <ChoiceGroup
          name="quotes-expand"
          label={'When someone presses "Read more" on a long reply'}
          choices={EXPANDS}
          value={expand}
          disabled={saving}
          onChange={setExpand}
        />

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
              onClick={() => {
                setLayout(settings.quotesLayout);
                setExpand(settings.quotesExpand);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChoiceGroup<T extends string>({
  name,
  label,
  choices,
  value,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  choices: Choice<T>[];
  value: T;
  disabled: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {choices.map((option) => {
          const picked = value === option.value;
          const id = `${name}-${option.value}`;
          return (
            <label
              key={option.value}
              // Tied to the input by id, so a click anywhere on the option
              // picks it — wrapping the input alone does not always do that.
              htmlFor={id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${
                picked ? "border-primary bg-accent/50" : "hover:bg-accent/30"
              }`}
            >
              <input
                type="radio"
                id={id}
                name={name}
                className="mt-1"
                checked={picked}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span className="space-y-1.5">
                <span className="block text-sm font-medium">
                  {option.title}
                </span>
                <span
                  aria-hidden
                  className="block whitespace-pre font-mono text-sm leading-tight tracking-widest text-primary/70"
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
    </fieldset>
  );
}
