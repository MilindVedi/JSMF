"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Quote, X } from "lucide-react";

/**
 * A horizontally-scrolling row of testimonial screenshots, each framed with a
 * quote mark, plus the lightbox they open into. Only the row and the lightbox:
 * the heading and copy around it belong to whichever section uses it — the
 * "previous session" testimonials (`testimonials-section.tsx`) on a light
 * band, and a session's own feedback (`session-feedback.tsx`) inside the dark
 * booking band.
 *
 * `tone` picks the colours for the band it sits on; the layout is identical.
 *
 * Any card opens the lightbox at that image. "View all" (shown only when
 * there is more than one) opens at the first one — same lightbox either way,
 * one image at a time with keyboard and on-screen navigation.
 */
export function TestimonialGallery({
  urls,
  tone = "light",
  imageAlt = "A message from a student",
}: {
  urls: string[];
  tone?: "light" | "dark";
  imageAlt?: string;
}) {
  // null = closed. A number is which image to show, so clicking a specific
  // card can open at that card rather than always restarting at zero — the
  // common case is "I want to read *this* one bigger," not "show me #1."
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // The scrolling row, with arrow buttons in place of a scrollbar. We track
  // how far it can still scroll either way so an arrow hides when its end is
  // reached — a button that does nothing is worse than no button.
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    setCanScroll({ left: row.scrollLeft > 4, right: row.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // urls.length so adding/removing cards re-checks whether arrows are needed.
  }, [measure, urls.length]);

  const scrollByCards = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    // Roughly one card-and-gap, so a tap advances by about one card.
    row.scrollBy({ left: direction * 300, behavior: "smooth" });
  };

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

  const dark = tone === "dark";
  const card = dark
    ? "border-brand-line bg-white/5"
    : "border-border bg-background";
  const viewAll = dark
    ? "border-brand-line bg-white/5 text-brand-on-deep hover:bg-white/10"
    : "border-border bg-background text-primary hover:bg-accent";
  const arrow = dark
    ? "border-brand-line bg-brand-deep/60 text-brand-on-deep hover:bg-brand-deep/90"
    : "border-border bg-background/60 text-brand-deep hover:bg-background/90";

  return (
    <>
      {/* The row bleeds to the screen edge on small screens (-mx-5/-mx-8);
          the arrow buttons sit just inside that bleed, vertically centred. */}
      <div className="relative">
        <div
          ref={rowRef}
          onScroll={measure}
          className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 lg:-mx-8 lg:px-8"
        >
          {urls.map((url, index) => (
            <button
              type="button"
              key={url}
              onClick={() => setActiveIndex(index)}
              title="Preview"
              aria-label={`Preview testimonial ${index + 1} of ${urls.length}`}
              className={`group/card relative aspect-[4/3] w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl border text-left shadow-editorial transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${card}`}
            >
              <Quote size={20} className="absolute left-4 top-4 z-10 text-primary/30" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={imageAlt} loading="lazy" className="size-full object-cover" />
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
              className={`flex aspect-[4/3] w-[280px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-semibold transition-colors ${viewAll}`}
            >
              View all
              <span className={`text-xs font-normal ${dark ? "opacity-70" : "text-muted-foreground"}`}>
                {urls.length} testimonials
              </span>
            </button>
          )}
        </div>

        {/* Arrow buttons stand in for the scrollbar. Shown from `sm` up,
            where a pointer is likely; on a phone the row is swiped. Each
            hides when there is nothing more to scroll that way. */}
        {canScroll.left && (
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            aria-label="Show previous testimonials"
            className={`absolute left-1 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full border shadow-editorial backdrop-blur transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid ${arrow}`}
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {canScroll.right && (
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            aria-label="Show more testimonials"
            className={`absolute right-1 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full border shadow-editorial backdrop-blur transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid ${arrow}`}
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {activeIndex !== null && (
        <TestimonialLightbox urls={urls} index={activeIndex} onClose={close} onStep={step} />
      )}
    </>
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
