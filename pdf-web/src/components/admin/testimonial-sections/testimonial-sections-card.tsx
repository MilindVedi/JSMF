"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CollapseToggle } from "@/components/admin/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  adminSessionApi,
  type AdminSession,
  type SessionTestimonialSection,
  type TestimonialSectionInput,
} from "@/lib/api/admin";

/**
 * Named testimonial galleries — "What students said after Day 1" — shown in
 * the booking band of the home page and /prep-kit, right beside the Book
 * button. Separate from the original Testimonials card above, which stays the
 * "previous session" section further down the page.
 *
 * Each section has its own heading, optional subheading and tag, an optional
 * day, a Show on website switch, and its own screenshots. A section shows only
 * when it is switched on and has at least one screenshot.
 */
export function TestimonialSectionsCard({
  session,
  onSessionChange,
  onCollapse,
}: {
  session: AdminSession;
  onSessionChange: (next: AdminSession) => void;
  onCollapse?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const sections = session.testimonialSections;

  const reload = async () => onSessionChange(await adminSessionApi.get(session.id));

  async function create() {
    setCreating(true);
    try {
      // Sensible defaults for the common case — feedback on the most recent
      // day that has already happened — all editable straight after.
      const now = Date.now();
      const past = session.days.filter((day) => new Date(day.startsAt).getTime() < now);
      const day = past[past.length - 1] ?? session.days[0];
      const number = day ? session.days.indexOf(day) + 1 : null;
      await adminSessionApi.createTestimonialSection(session.id, {
        heading: number ? `What students said after Day ${number}` : "What students are saying",
        dayId: day?.id ?? null,
        // Hidden until it has its screenshots and copy checked.
        isVisible: false,
      });
      await reload();
      toast.success("Section added", { description: "Add screenshots, then switch on Show on website." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the section");
    } finally {
      setCreating(false);
    }
  }

  async function move(sectionId: string, direction: -1 | 1) {
    const index = sections.findIndex((s) => s.id === sectionId);
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const reordered = [...sections];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onSessionChange({ ...session, testimonialSections: reordered });
    try {
      await adminSessionApi.reorderTestimonialSections(session.id, reordered.map((s) => s.id));
    } catch (error) {
      onSessionChange({ ...session, testimonialSections: sections });
      toast.error(error instanceof Error ? error.message : "Could not reorder");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center">
            <CollapseToggle onCollapse={onCollapse} />
            Feedback sections · {sections.length}
          </span>
          <Button size="sm" variant="outline" disabled={creating} onClick={() => void create()}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add section
          </Button>
        </CardTitle>
        <CardDescription>
          Screenshots of what people said about this session — after Day 1, for example — shown in the booking
          section of the home page and /prep-kit, next to the Book button. A section appears only when Show on website
          is on and it has at least one screenshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          sections.map((section, index) => (
            <SectionEditor
              key={section.id}
              session={session}
              section={section}
              first={index === 0}
              last={index === sections.length - 1}
              onMove={(direction) => void move(section.id, direction)}
              onChanged={reload}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SectionEditor({
  session,
  section,
  first,
  last,
  onMove,
  onChanged,
}: {
  session: AdminSession;
  section: SessionTestimonialSection;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    heading: section.heading,
    subheading: section.subheading ?? "",
    tag: section.tag ?? "",
    dayId: section.dayId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dirty =
    draft.heading !== section.heading ||
    draft.subheading !== (section.subheading ?? "") ||
    draft.tag !== (section.tag ?? "") ||
    draft.dayId !== (section.dayId ?? "");

  async function save(input: TestimonialSectionInput, message = "Section saved") {
    setSaving(true);
    try {
      await adminSessionApi.updateTestimonialSection(session.id, section.id, input);
      await onChanged();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await adminSessionApi.addTestimonial(session.id, file, section.id);
      }
      await onChanged();
      toast.success(files.length === 1 ? "Screenshot added" : `${files.length} screenshots added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the screenshot");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(testimonialId: string) {
    if (!window.confirm("Remove this screenshot? The image is deleted too.")) return;
    try {
      await adminSessionApi.removeTestimonial(session.id, testimonialId);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove it");
    }
  }

  async function moveImage(testimonialId: string, direction: -1 | 1) {
    const items = section.testimonials;
    const index = items.findIndex((item) => item.id === testimonialId);
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await adminSessionApi.reorderTestimonials(session.id, reordered.map((item) => item.id), section.id);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder");
    }
  }

  async function removeSection() {
    if (!window.confirm(`Delete "${section.heading}" and its ${section.testimonials.length} screenshot(s)? To keep it, switch off Show on website instead.`)) {
      return;
    }
    try {
      await adminSessionApi.removeTestimonialSection(session.id, section.id);
      await onChanged();
      toast.success("Section deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete it");
    }
  }

  const live = section.isVisible && section.testimonials.length > 0;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Switch
            checked={section.isVisible}
            disabled={saving}
            onCheckedChange={(checked: boolean) =>
              void save({ isVisible: checked }, checked ? "Shown on the website" : "Hidden from the website")
            }
          />
          <Label className="text-sm font-medium">Show on website</Label>
          <Badge variant="outline" className="text-xs">
            {live ? "Live" : section.isVisible ? "No screenshots yet" : "Hidden"}
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" disabled={first} aria-label="Move section up" onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={last} aria-label="Move section down" onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Delete section" onClick={() => void removeSection()}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Heading</Label>
          <Input
            maxLength={150}
            value={draft.heading}
            onChange={(event) => setDraft((d) => ({ ...d, heading: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Subheading</Label>
          <Input
            maxLength={300}
            placeholder="Optional. A line under the heading."
            value={draft.subheading}
            onChange={(event) => setDraft((d) => ({ ...d, subheading: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tag</Label>
          <Input
            maxLength={80}
            placeholder="Optional, e.g. Live from Day 1"
            value={draft.tag}
            onChange={(event) => setDraft((d) => ({ ...d, tag: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>About which day</Label>
          <select
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={draft.dayId}
            onChange={(event) => setDraft((d) => ({ ...d, dayId: event.target.value }))}
          >
            <option value="">No particular day</option>
            {session.days.map((day, index) => (
              <option key={day.id} value={day.id}>
                Day {index + 1}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Labels the section &ldquo;Day N feedback&rdquo; on the website.</p>
        </div>
      </div>
      <Button
        size="sm"
        disabled={!dirty || saving || !draft.heading.trim()}
        onClick={() =>
          void save({
            heading: draft.heading,
            subheading: draft.subheading,
            tag: draft.tag,
            dayId: draft.dayId || null,
          })
        }
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : null} Save section
      </Button>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Screenshots · {section.testimonials.length}</p>
          <label className={buttonVariants({ variant: "outline", size: "sm", className: "cursor-pointer" })}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : "Add screenshots"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(event) => void upload(event.target.files)}
            />
          </label>
        </div>
        {section.testimonials.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. PNG, JPEG or WebP, up to 8MB each.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {section.testimonials.map((item, index) => (
              <div key={item.id} className="group relative overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="aspect-[4/3] w-full object-cover" />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => void removeImage(item.id)}
                >
                  Remove
                </Button>
                <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="size-7 p-0"
                    disabled={index === 0}
                    aria-label="Move earlier"
                    onClick={() => void moveImage(item.id, -1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="size-7 p-0"
                    disabled={index === section.testimonials.length - 1}
                    aria-label="Move later"
                    onClick={() => void moveImage(item.id, 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
