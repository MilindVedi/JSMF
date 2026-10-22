"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, RotateCcw } from "lucide-react";
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
  adminSettingsApi,
  type AdminPlatformSettings,
  type MentorCardStyle,
} from "@/lib/api/settings";
import { mainWebsiteHost } from "@/lib/site-content";

/** The bundled photo — what the sites show while nothing is uploaded. */
const BUNDLED_PHOTO = "/dr-angad-rai-v2.jpg";

/**
 * What an upload must be. 3:4 because both looks frame the photo at 3:4 —
 * the poster's arch and the card's frame alike — so a 3:4 photo is shown
 * whole, edge to edge, and anything else gets cropped.
 */
const PHOTO = {
  ratio: 3 / 4,
  /** How far from 3:4 still counts as 3:4 — a phone crop is rarely exact. */
  tolerance: 0.03,
  minWidth: 900,
  minHeight: 1200,
  maxBytes: 8 * 1024 * 1024,
  types: ["image/jpeg", "image/png", "image/webp"],
} as const;

const STYLES: { value: MentorCardStyle; title: string; detail: string }[] = [
  {
    value: "POSTER",
    title: "Poster",
    detail:
      "An arched photo with the AIR 925 and AIR 9 medals floating on its edges, and the name in purple across the bottom.",
  },
  {
    value: "CARD",
    title: "Card",
    detail:
      "The framed photo with Instagram, YouTube and Telegram on top, and a white card below it listing the achievements.",
  },
];

/** Reads a picked file's pixel size in the browser, before anything is sent. */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      reject(new Error("That file could not be read as an image."));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

/** Why a picked file will not do, in words the admin can act on — or null if it will. */
async function problemWith(file: File): Promise<string | null> {
  if (!(PHOTO.types as readonly string[]).includes(file.type)) {
    return "Use a JPEG, PNG or WebP image.";
  }
  if (file.size > PHOTO.maxBytes) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under 8 MB — export it as a JPEG at about 85% quality.`;
  }
  const { width, height } = await measure(file);
  if (Math.abs(width / height - PHOTO.ratio) > PHOTO.tolerance) {
    return `That photo is ${width} × ${height} px. It needs to be tall, in a 3:4 shape — crop it to 3:4 first (for example 1200 × 1600 px).`;
  }
  if (width < PHOTO.minWidth || height < PHOTO.minHeight) {
    return `That photo is ${width} × ${height} px, which will look blurry. It needs to be at least ${PHOTO.minWidth} × ${PHOTO.minHeight} px.`;
  }
  return null;
}

/**
 * How Dr. Angad's portrait looks in the hero of the main website and this
 * store, and which photo it shows. Both apply to both sites at once.
 *
 * Takes the settings from the page rather than loading its own, since the
 * settings page already has them, and hands every saved result back so the
 * page stays the one copy.
 */
export function MentorPortraitCard({
  settings,
  onSaved,
}: {
  settings: AdminPlatformSettings;
  onSaved: (next: AdminPlatformSettings) => void;
}) {
  const [busy, setBusy] = useState<"style" | "upload" | "remove" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const photo = settings.mentorPhotoUrl ?? BUNDLED_PHOTO;

  async function pickStyle(style: MentorCardStyle) {
    if (style === settings.mentorCardStyle) return;
    setBusy("style");
    try {
      onSaved(await adminSettingsApi.update({ mentorCardStyle: style }));
      toast.success("Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setProblem(null);
    setBusy("upload");
    try {
      const why = await problemWith(file);
      if (why) {
        setProblem(why);
        return;
      }
      onSaved(await adminSettingsApi.uploadMentorPhoto(file));
      toast.success("Photo updated on both websites");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the photo");
    } finally {
      setBusy(null);
      // The same file can be picked again after fixing it.
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      onSaved(await adminSettingsApi.removeMentorPhoto());
      toast.success("Back to the original photo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the photo");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dr. Angad&apos;s portrait</CardTitle>
        <CardDescription>
          The photo at the top of the {mainWebsiteHost} home page, /prep-kit, and this store&apos;s home page.
          Changes show on both websites at once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Look</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {STYLES.map((option) => {
              const picked = settings.mentorCardStyle === option.value;
              const id = `mentor-style-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={id}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${
                    picked ? "border-primary bg-accent/50" : "hover:bg-accent/30"
                  }`}
                >
                  <input
                    type="radio"
                    id={id}
                    name="mentor-style"
                    className="mt-1"
                    checked={picked}
                    disabled={busy !== null}
                    onChange={() => void pickStyle(option.value)}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">{option.title}</span>
                    <span className="block text-xs text-muted-foreground">{option.detail}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-[11rem_1fr]">
          {/* The photo as the poster frames it, with where the chip and the
              name fall, so the admin can see a face will not be covered. */}
          <div className="relative h-56 w-44 overflow-hidden rounded-[88px_88px_12px_12px] border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- bundled, or a signed storage URL */}
            <img src={photo} alt="Current portrait" className="size-full object-cover object-[center_25%]" />
            <span className="absolute inset-x-0 top-0 h-[12%] border-b border-dashed border-white/80 bg-white/25" />
            <span className="absolute inset-x-0 bottom-0 grid h-[34%] place-items-center border-t border-dashed border-white/80 bg-[color-mix(in_oklab,var(--primary)_55%,transparent)] text-[10px] font-semibold text-white">
              Name goes here
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <p className="font-medium">
              {settings.mentorPhotoUrl ? "Uploaded photo" : "Original photo (comes with the websites)"}
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Tall, 3:4 shape</span> — ideally{" "}
                <span className="font-medium text-foreground">1200 × 1600 px</span>, at least 900 × 1200 px.
                A phone photo taken upright is already 3:4.
              </li>
              <li>JPEG, PNG or WebP, up to 8 MB.</li>
              <li>
                Keep the face in the <span className="font-medium text-foreground">upper half</span>, with a little
                space above the head — the top strip holds the &ldquo;Your doctor. Your mentor.&rdquo; label.
              </li>
              <li>
                The <span className="font-medium text-foreground">bottom third</span> is covered by his name on the
                poster, so nothing important should be there.
              </li>
            </ul>

            {problem && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                {problem}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <input
                ref={input}
                type="file"
                accept={PHOTO.types.join(",")}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button size="sm" disabled={busy !== null} onClick={() => input.current?.click()}>
                {busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
                {settings.mentorPhotoUrl ? "Replace photo" : "Upload a photo"}
              </Button>
              {settings.mentorPhotoUrl && (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void remove()}>
                  {busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  Use the original photo
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
