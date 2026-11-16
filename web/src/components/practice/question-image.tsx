"use client";

import { useState } from "react";
import { Expand } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * An image that belongs to a question — an X-ray, photo or diagram — shown
 * at reading size, and full size in a dialog on click, where its detail can
 * actually be read.
 */
export function QuestionImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-xl border border-border bg-muted/40"
        aria-label={`${alt} — open full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- stored question images from the API, any host */}
        <img src={src} alt={alt} loading="lazy" className="mx-auto max-h-80 w-auto max-w-full object-contain" />
        <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-xs font-medium text-foreground opacity-80 shadow-sm group-hover:opacity-100">
          <Expand className="size-3.5" />
          Enlarge
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(96vw,64rem)] p-2 sm:max-w-[min(96vw,64rem)]">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- stored question images from the API, any host */}
          <img src={src} alt={alt} className="mx-auto max-h-[85vh] w-auto max-w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
