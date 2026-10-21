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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminSessionApi, type NoSessionTestimonials } from "@/lib/api/admin";
import { mainWebsiteHost } from "@/lib/site-content";
import { NoSessionPicks } from "./no-session-picks";
import { istLabel } from "@/app/(admin)/admin/sessions/ist";

const AUTOMATIC = "AUTO";
const HAND_PICKED = "HAND";
const CUSTOM = "CUSTOM";

interface Draft {
  enabled: boolean;
  source: string;
  heading: string;
  subheading: string;
}

function draftOf(settings: NoSessionTestimonials): Draft {
  return {
    enabled: settings.enabled,
    source: settings.handPicked
      ? HAND_PICKED
      : (settings.sessionId ?? AUTOMATIC),
    heading: settings.heading ?? settings.headingOptions[0] ?? "",
    subheading: settings.subheading ?? settings.defaultSubheading,
  };
}

/**
 * What the home page and /prep-kit show in the testimonials band while no
 * session is upcoming: on or off, whose screenshots, and the copy above them.
 * The heading is picked from a short list and can then be edited.
 */
export function NoSessionTestimonialsCard() {
  const [settings, setSettings] = useState<NoSessionTestimonials | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminSessionApi
      .noSessionTestimonials()
      .then((loaded) => {
        setSettings(loaded);
        setDraft(draftOf(loaded));
      })
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not load this setting",
        ),
      );
  }, []);

  if (!settings || !draft) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const automatic = settings.sessions.find(
    (s) => s.id === settings.automaticSessionId,
  );
  const sessionLabel = (s: NoSessionTestimonials["sessions"][number]) =>
    `${s.title}${s.startsAt ? ` · ${istLabel(s.startsAt)}` : ""} · ${s.testimonialCount} screenshot${s.testimonialCount === 1 ? "" : "s"}`;
  const sourceItems: Record<string, string> = {
    [HAND_PICKED]:
      "Hand-picked: screenshots and replies chosen below, from any sessions",
    [AUTOMATIC]: automatic
      ? `Automatic: the latest past session (now ${automatic.title})`
      : "Automatic: the latest past session",
    ...Object.fromEntries(
      settings.sessions.map((s) => [s.id, sessionLabel(s)]),
    ),
  };
  const handPicked = draft.source === HAND_PICKED;
  const headingPreset = settings.headingOptions.includes(draft.heading)
    ? draft.heading
    : CUSTOM;
  const headingItems: Record<string, string> = {
    ...Object.fromEntries(
      settings.headingOptions.map((option) => [option, option]),
    ),
    [CUSTOM]: "Edited (your own text)",
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(settings));

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await adminSessionApi.updateNoSessionTestimonials({
        enabled: draft.enabled,
        handPicked: draft.source === HAND_PICKED,
        // Hand-picked leaves the one-session choice as it was, to switch back to.
        ...(draft.source === HAND_PICKED
          ? {}
          : { sessionId: draft.source === AUTOMATIC ? null : draft.source }),
        heading: draft.heading.trim() || null,
        subheading: draft.subheading.trim() || null,
      });
      setSettings(saved);
      setDraft(draftOf(saved));
      toast.success("Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>When no session is upcoming</CardTitle>
        <CardDescription>
          The testimonials {mainWebsiteHost} and /prep-kit show between
          sessions. While a session is upcoming, its own testimonials are shown
          instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-center gap-3">
            <Switch
              id="no-session-enabled"
              checked={draft.enabled}
              disabled={saving}
              onCheckedChange={(enabled: boolean) =>
                setDraft({ ...draft, enabled })
              }
            />
            <Label htmlFor="no-session-enabled" className="text-sm font-medium">
              Show testimonials while no session is upcoming
            </Label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Off hides the testimonials band until the next session is published.
          </p>
        </div>

        {draft.enabled && (
          <>
            <div className="space-y-1.5">
              <Label>Whose testimonials</Label>
              <>
                <Select
                  items={sourceItems}
                  value={draft.source}
                  onValueChange={(value: string | null) =>
                    setDraft({ ...draft, source: value ?? AUTOMATIC })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(sourceItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {handPicked
                    ? "Picks are saved as you make them. Press Save to switch the website over to them."
                    : "The screenshots in that session's Testimonials section, in the same order."}
                </p>
              </>
              {handPicked && settings.handPicked !== handPicked && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Not live yet: the website still shows the previous choice
                  until you press Save.
                </p>
              )}
            </div>

            {handPicked && (
              <NoSessionPicks settings={settings} onSettings={setSettings} />
            )}

            <div className="space-y-1.5">
              <Label htmlFor="no-session-heading">Heading</Label>
              <Select
                items={headingItems}
                value={headingPreset}
                onValueChange={(value: string | null) => {
                  if (value && value !== CUSTOM)
                    setDraft({ ...draft, heading: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.headingOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                  {headingPreset === CUSTOM && (
                    <SelectItem value={CUSTOM}>
                      {headingItems[CUSTOM]}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Input
                id="no-session-heading"
                value={draft.heading}
                maxLength={150}
                onChange={(event) =>
                  setDraft({ ...draft, heading: event.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Pick one, then edit it here if you like. Left empty, the first
                option is used.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="no-session-subheading">
                Text under the heading
              </Label>
              <Textarea
                id="no-session-subheading"
                rows={2}
                value={draft.subheading}
                maxLength={300}
                onChange={(event) =>
                  setDraft({ ...draft, subheading: event.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Left empty: &ldquo;{settings.defaultSubheading}&rdquo;
              </p>
            </div>
          </>
        )}

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
              onClick={() => setDraft(draftOf(settings))}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
