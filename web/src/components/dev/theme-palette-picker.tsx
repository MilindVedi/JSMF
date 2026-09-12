"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Palette, StickyNote, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import { useAuthStore } from "@/store/auth-store";
import { AngadNote } from "@/components/dev/angad-note";

const PALETTE_KEY = "jsmf-palette";
const PRIMARY_KEY = "jsmf-primary";

const PALETTES = [
  { id: "teal", label: "Navy + Teal", swatch: "oklch(0.6240 0.1010 198)" },
  { id: "emerald", label: "Navy + Emerald", swatch: "oklch(0.5650 0.1090 168)" },
  { id: "amber", label: "Navy + Amber", swatch: "oklch(0.7200 0.1450 75)" },
  { id: "monochrome", label: "Navy only", swatch: "oklch(0.2850 0.0650 258)" },
] as const;

const PRIMARIES = [
  { id: "navy", label: "Navy", swatch: "oklch(0.2850 0.0650 258)" },
  { id: "charcoal", label: "Charcoal", swatch: "oklch(0.2600 0.0080 260)" },
  { id: "slate", label: "Slate blue", swatch: "oklch(0.4200 0.0950 250)" },
  { id: "indigo", label: "Indigo", swatch: "oklch(0.3400 0.1250 288)" },
] as const;

type PaletteId = (typeof PALETTES)[number]["id"];
type PrimaryId = (typeof PRIMARIES)[number]["id"];

function SwatchGroup<T extends string>({
  title,
  options,
  active,
  onChoose,
}: {
  title: string;
  options: readonly { id: T; label: string; swatch: string }[];
  active: T;
  onChoose: (id: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {options.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChoose(p.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
              active === p.id && "bg-muted"
            )}
          >
            <span
              className="size-4 shrink-0 rounded-full ring-1 ring-border"
              style={{ backgroundColor: p.swatch }}
            />
            <span className="flex-1 text-foreground">{p.label}</span>
            {active === p.id && <Check className="size-3.5 text-foreground" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Review-only tool: lets a reviewer swap the brand accent color and the
 * main ink color (headings/button backgrounds) live, to compare options
 * side by side. Doesn't touch background/off-white or anything else.
 * Not part of the real product — safe to delete once colors are picked.
 */
function readStored<T extends string>(key: string, allowed: readonly { id: T }[], fallback: T): T {
  const stored = window.localStorage.getItem(key) as T | null;
  return stored && allowed.some((o) => o.id === stored) ? stored : fallback;
}

export function ThemePalettePicker() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // The question-attempting flow has its own sticky bottom action bar
  // (Submit/Next) that this floating button would otherwise sit on top of
  // on narrow screens, so it's hidden entirely there rather than repositioned.
  const hidden = pathname?.startsWith("/practice");
  // Logged-in app screens are the real product surface, so this reviewer
  // tool starts tucked away behind a small arrow there instead of sitting
  // in front of app content by default — the public marketing site has no
  // such competing content, so it keeps showing the button outright.
  const [collapsed, setCollapsed] = useState(true);

  // localStorage and "are we on the client yet" are both client-only reads.
  const mounted = useClientSnapshot(() => true, false);
  const storedPalette = useClientSnapshot<PaletteId>(
    () => readStored(PALETTE_KEY, PALETTES, "teal"),
    "teal"
  );
  const storedPrimary = useClientSnapshot<PrimaryId>(
    () => readStored(PRIMARY_KEY, PRIMARIES, "navy"),
    "navy"
  );

  // A click is the only thing that changes the selection, so the picked value
  // takes precedence over what was stored when the page loaded.
  const [pickedPalette, setPickedPalette] = useState<PaletteId | null>(null);
  const [pickedPrimary, setPickedPrimary] = useState<PrimaryId | null>(null);
  const palette = pickedPalette ?? storedPalette;
  const primary = pickedPrimary ?? storedPrimary;

  // Syncing the <html> attributes is an external-system write, which is what
  // effects are for.
  useEffect(() => {
    document.documentElement.setAttribute("data-palette", palette);
  }, [palette]);
  useEffect(() => {
    document.documentElement.setAttribute("data-primary", primary);
  }, [primary]);

  function choosePalette(id: PaletteId) {
    setPickedPalette(id);
    window.localStorage.setItem(PALETTE_KEY, id);
  }

  function choosePrimary(id: PrimaryId) {
    setPickedPrimary(id);
    window.localStorage.setItem(PRIMARY_KEY, id);
  }

  if (!mounted || hidden) return null;

  if (isAuthenticated && collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Show theme preview control"
        className="fixed right-0 bottom-24 z-[100] flex h-10 w-5 items-center justify-center rounded-l-full border border-r-0 border-border bg-popover text-muted-foreground shadow-lg transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </button>
    );
  }

  return (
    <div className="fixed right-4 bottom-24 z-[100] flex flex-col items-end gap-2">
      {open && (
        <div className="w-64 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Theme preview</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="mb-3 rounded-lg border border-dashed border-border bg-muted/60 p-2.5 text-xs text-foreground">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <StickyNote className="size-3.5" />
              Note for Angad
            </p>
            <p className="text-muted-foreground">
              Pick whichever accent + primary color combination below you think works best for the
              product, or tell us to decide together — happy to sit down and try out other combinations
              live too.
            </p>
          </div>

          <div className="flex flex-col gap-3.5">
            <SwatchGroup title="Accent color" options={PALETTES} active={palette} onChoose={choosePalette} />
            <div className="border-t border-border pt-3">
              <SwatchGroup
                title="Primary / text color"
                options={PRIMARIES}
                active={primary}
                onChoose={choosePrimary}
              />
            </div>
          </div>

          <p className="mt-3 border-t border-border pt-2 text-[0.65rem] text-muted-foreground">
            Preview only — saved in this browser, not visible to other visitors.
          </p>
        </div>
      )}
      <div className="flex items-center gap-1">
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => {
              setCollapsed(true);
              setOpen(false);
            }}
            aria-label="Hide theme preview control"
            className="flex size-8 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-lg transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 items-center gap-2 rounded-full border border-border bg-popover px-4 text-sm font-medium text-popover-foreground shadow-lg transition-colors hover:bg-muted"
        >
          <Palette className="size-4" />
          Theme
        </button>
      </div>
    </div>
  );
}
