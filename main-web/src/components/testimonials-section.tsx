"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Quote, X } from "lucide-react";
import type { LiveSession } from "@/lib/api/types";

/**
 * A horizontally-scrolling row of what past attendees said, each card framed
 * with a quote mark the way a pull-quote would be — the screenshot is the
 * content, this only supplies the frame around it. The heading and subheading
 * fall back to generic defaults when the session has not set them; the small
 * tag on the right is left out entirely when unset — an empty "chip" with a
 * dangling border reads as broken decoration, not deliberate restraint.
 *
 * Any card opens the lightbox at that image. "View all" (shown only when
 * there is more than one testimonial) opens at the first one — same lightbox
 * either way, one testimonial at a time with keyboard and on-screen navigation.
 *
 * Shared by the home page (`landing.tsx`) and `/prep-kit` (`book-page.tsx`).
 */
export function TestimonialsSection({ session }: { session: LiveSession }) {
  const urls = session.testimonialUrls;
  // null = closed. A number is which image to show, so clicking a specific
  // card can open at that card rather than always restarting at zero — the
  // common case is "I want to read *this* one bigger," not "show me #1."
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const close = useCallback(() => setActiveIndex(null), []);
  // Wrap around so the loop never dead-ends on an arrow press. urls.length
  // is read inside so a hot-reloaded set does not stale the closure.
  const step = useCallback(
    (delta: number) =>
      setActiveIndex((current) =>
        current === null ? current : (current + delta + urls.length) % urls.length,
      ),
    [urls.length],
  );

  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [activeIndex, close, step]);

  if (urls.length === 0) return null;

  return (
    <section className="border-t border-border bg-card py-16">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
          <Quote size={13} /> In their own words
        </span>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="max-w-2xl font-display text-3xl font-semibold leading-tight text-brand-deep md:text-4xl">
              {session.testimonialsHeading || "What students said after the last session."}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {session.testimonialsSubheading ||
                "From a previous revision session held before the FMGE exam. A few moments students shared afterward."}
            </p>
          </div>
          {/* Optional, so it is left out entirely when unset — an empty tag
              with a dangling border reads as broken, not minimal. */}
          {session.testimonialsTag && (
            <span className="flex items-center gap-2 border-l-2 border-primary pl-3 text-[11px] font-bold uppercase tracking-wide text-primary">
              {session.testimonialsTag}
            </span>
          )}
        </div>

        <div className="mt-10 -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 lg:-mx-8 lg:px-8">
          {urls.map((url, index) => (
            <button
              type="button"
              key={url}
              onClick={() => setActiveIndex(index)}
              title="Preview"
              aria-label={`Preview testimonial ${index + 1} of ${urls.length}`}
              className="group/card relative aspect-[4/3] w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-background text-left shadow-editorial transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Quote size={20} className="absolute left-4 top-4 z-10 text-primary/30" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="A message from a student about the previous session"
                loading="lazy"
                className="size-full object-cover"
              />
              {/* The hover overlay: a soft dim so the eye icon reads over any
                  background, and the label sits beside the icon so what the
                  click does is spelled out, not just implied by the pictogram. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-sm font-semibold text-white opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-visible/card:opacity-100"
              >
                <Eye size={18} /> Preview
              </span>
            </button>
          ))}

          {urls.length > 1 && (
            <button
              type="button"
              onClick={() => setActiveIndex(0)}
              className="flex aspect-[4/3] w-[280px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background text-sm font-semibold text-primary transition-colors hover:bg-accent"
            >
              View all
              <span className="text-xs font-normal text-muted-foreground">{urls.length} testimonials</span>
            </button>
          )}
        </div>
      </div>

      {activeIndex !== null && (
        <TestimonialLightbox urls={urls} index={activeIndex} onClose={close} onStep={step} />
      )}
    </section>
  );
}

/**
 * One testimonial, big, with the next/prev buttons sitting outside the image
 * so they do not sit on top of what someone is trying to read. The backdrop
 * closes it; the image itself does not — clicking it is a common accident
 * when the pointer is already there to tap "Next".
 */
function TestimonialLightbox({
  urls,
  index,
  onClose,
  onStep,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const only = urls.length <= 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-black/80 p-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Testimonial"
      onClick={onClose}
    >
      <div className="flex items-center justify-between text-white">
        <span className="text-sm font-semibold">
          {index + 1} / {urls.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-10 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <div className="mt-2 flex flex-1 items-center justify-center gap-3 sm:gap-6">
        {!only && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStep(-1);
            }}
            aria-label="Previous testimonial"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:size-12"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[index]}
          alt={`Testimonial ${index + 1} of ${urls.length}`}
          onClick={(event) => event.stopPropagation()}
          className="max-h-[80vh] max-w-full rounded-xl bg-white object-contain shadow-2xl"
        />

        {!only && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStep(1);
            }}
            aria-label="Next testimonial"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:size-12"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {!only && (
        /* Tiny dot strip so position in the set is visible at a glance, and
           tappable on a phone where arrow keys are not an option. */
        <div className="mt-3 flex justify-center gap-1.5" onClick={(event) => event.stopPropagation()}>
          {urls.map((url, dotIndex) => (
            <button
              type="button"
              key={url}
              onClick={() => onStep(dotIndex - index)}
              aria-label={`Go to testimonial ${dotIndex + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                dotIndex === index ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
