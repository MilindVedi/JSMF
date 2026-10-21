"use client";

import { useEffect, useRef, useState } from "react";
import { Quote, X } from "lucide-react";
import { ScrollRow } from "@/components/scroll-row";
import { TestimonialGallery } from "@/components/testimonial-gallery";
import type {
  LiveSession,
  QuoteExpand,
  QuoteLayout,
  SectionQuote,
} from "@/lib/api/types";

/**
 * What people are saying about *this* session — "What students said after
 * Day 1" — inside the dark booking band, right beside the Book button, where
 * it does the most work. One block per named section the admin has made
 * visible; renders nothing when there are none.
 *
 * Styled for the dark band (the same chip, type scale and spacing as the
 * session details above it); the screenshots and lightbox are the shared
 * TestimonialGallery in its dark tone. Written replies picked from the
 * feedback form come first, as quote cards; a section may have either or both.
 *
 * Shared by the home page (`landing.tsx`) and `/prep-kit` (`book-page.tsx`).
 */
export function SessionFeedback({
  session,
  layout = "SCROLL",
  expand = "POPUP",
  className = "",
}: {
  session: LiveSession;
  layout?: QuoteLayout;
  expand?: QuoteExpand;
  className?: string;
}) {
  const sections = session.testimonialSections ?? [];
  if (sections.length === 0) return null;

  return (
    <div className={`space-y-14 ${className}`}>
      {sections.map((section) => (
        <div key={section.id}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-line px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                <Quote size={13} />{" "}
                {section.dayNumber
                  ? `Day ${section.dayNumber} feedback`
                  : "In their own words"}
              </span>
              <h3 className="mt-5 max-w-2xl font-display text-2xl font-semibold leading-tight md:text-3xl">
                {section.heading}
              </h3>
              {section.subheading && (
                <p className="mt-3 max-w-2xl text-base leading-relaxed opacity-80">
                  {section.subheading}
                </p>
              )}
            </div>
            {/* Optional, like the testimonials tag — left out when unset. */}
            {section.tag && (
              <span className="flex items-center gap-2 border-l-2 border-primary pl-3 text-[11px] font-bold uppercase tracking-wide opacity-90">
                {section.tag}
              </span>
            )}
          </div>

          {(section.quotes?.length ?? 0) > 0 && (
            <div className="mt-8">
              <QuoteCards
                quotes={section.quotes!}
                layout={layout}
                expand={expand}
              />
            </div>
          )}

          {section.urls.length > 0 && (
            <div className="mt-8">
              <TestimonialGallery
                urls={section.urls}
                tone="dark"
                imageAlt={`A message from a student${section.dayNumber ? ` after Day ${section.dayNumber}` : ""}`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Past this many characters a reply is cut to five lines, with "Read more". */
const LONG_QUOTE = 220;

const QUOTE_TONES = {
  // Inside the dark booking band: the featured card in brand purple, the rest translucent.
  dark: {
    featured: "border border-transparent bg-primary text-white shadow-editorial",
    card: "border border-brand-line bg-white/5",
    icon: "text-primary",
    rule: "border-brand-line",
    caption: "opacity-70",
  },
  // On the light testimonials band: the featured card in deep purple, the rest white.
  light: {
    featured: "border border-transparent bg-brand-deep text-white shadow-editorial",
    card: "border border-border bg-card text-brand-deep",
    icon: "text-primary/60",
    rule: "border-border",
    caption: "text-muted-foreground",
  },
} as const;

/**
 * Card widths, as a share of the row, chosen so the next card is always part
 * way into view: that peek is what says "there is more to the side". Two
 * cards from 560px up, where each is still wide enough to read; below that
 * one at a time, since two on a phone would be about a dozen characters a
 * line.
 */
const QUOTE_CARD_WIDTH =
  "w-[82%] max-w-[300px] min-[560px]:w-[46%] min-[560px]:max-w-none lg:w-[31%]";

/**
 * Written replies, as pulled-quote cards above any screenshots, so neither
 * has to match the other's size. Cards share one height, with the divider and
 * name at the bottom, and the first is featured. A long reply shows five
 * lines. What "Read more" does is the admin's `expand` choice: "POPUP" (the
 * default) opens it whole in a pop-up that scrolls on its own, so a card keeps
 * its size however long the reply (up to 5,000 characters); "INLINE" grows
 * the card in place, with "Show less" to fold it back — and the cards beside
 * it grow with it, so every name line in the row stays level.
 *
 * `layout` is the admin's site-wide choice: "SCROLL" (the default) is one row
 * that scrolls sideways, two or three in view with the next part way in;
 * "GRID" wraps them onto as many lines as it takes, with nothing to scroll.
 *
 * Shared by the booking band here and the light testimonials band.
 */
export function QuoteCards({
  quotes,
  tone = "dark",
  layout = "SCROLL",
  expand = "POPUP",
}: {
  quotes: SectionQuote[];
  tone?: keyof typeof QUOTE_TONES;
  layout?: QuoteLayout;
  expand?: QuoteExpand;
}) {
  const style = QUOTE_TONES[tone];
  const [reading, setReading] = useState<SectionQuote | null>(null);
  const scrolls = layout === "SCROLL";
  const inline = expand === "INLINE";

  const cards = quotes.map((item, index) => {
    const featured = index === 0;
    const long = item.quote.length > LONG_QUOTE;
    const text = <>&ldquo;{item.quote}&rdquo;</>;
    return (
      <figure
        key={item.id}
        className={`flex flex-col rounded-2xl p-6 ${scrolls ? `shrink-0 snap-start ${QUOTE_CARD_WIDTH}` : ""} ${featured ? style.featured : style.card}`}
      >
        <Quote
          size={28}
          strokeWidth={1.75}
          className={`mb-4 shrink-0 ${featured ? "text-white/80" : style.icon}`}
          aria-hidden
        />
        <blockquote className="flex-1 font-display text-[17px] font-semibold leading-snug">
          {long && inline ? (
            <details className="group">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="line-clamp-5 whitespace-pre-line group-open:line-clamp-none">
                  {text}
                </span>
                <span className="mt-2 inline-block font-sans text-xs font-semibold underline underline-offset-4 opacity-75">
                  <span className="group-open:hidden">Read more</span>
                  <span className="hidden group-open:inline">Show less</span>
                </span>
              </summary>
            </details>
          ) : (
            <p className={`whitespace-pre-line ${long ? "line-clamp-5" : ""}`}>
              {text}
            </p>
          )}
          {long && !inline && (
            <button
              type="button"
              onClick={() => setReading(item)}
              className="mt-2 font-sans text-xs font-semibold underline underline-offset-4 opacity-75 transition-opacity hover:opacity-100"
            >
              Read more
            </button>
          )}
        </blockquote>
        <hr
          className={`mt-6 border-0 border-t ${featured ? "border-white/20" : style.rule}`}
        />
        <figcaption
          className={`mt-4 text-xs font-semibold ${featured ? "text-white/75" : style.caption}`}
        >
          Student feedback
          {item.attribution ? ` · ${item.attribution}` : ""}
        </figcaption>
      </figure>
    );
  });

  return (
    <>
      {scrolls ? (
        <ScrollRow
          count={quotes.length}
          tone={tone}
          previousLabel="Show previous replies"
          nextLabel="Show more replies"
          // Every card as tall as the tallest, so the names line up in a row.
          className="items-stretch gap-5"
        >
          {cards}
        </ScrollRow>
      ) : (
        <div
          // Every card as tall as the tallest in its line, so the names line up.
          className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {cards}
        </div>
      )}
      {!inline && (
        <QuoteDialog quote={reading} onClose={() => setReading(null)} />
      )}
    </>
  );
}

/**
 * One reply in full, over the page. The native <dialog> brings what a pop-up
 * needs without a library: it sits above everything, Escape closes it, focus
 * moves in and goes back to "Read more" afterwards, and the page behind
 * cannot be clicked. A tap on the dimmed backdrop closes it too. Only the
 * text scrolls, so the close button and the name stay in view.
 */
function QuoteDialog({
  quote,
  onClose,
}: {
  quote: SectionQuote | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !quote) return;
    dialog.showModal();
    // The page behind stays put while the reply is read. Cleared rather than
    // put back to whatever was found, as the lightbox does: reading what is
    // there risks catching another dialog's "hidden" and keeping it forever.
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      if (dialog.open) dialog.close();
    };
  }, [quote]);

  return (
    <dialog
      ref={ref}
      aria-label="A student's reply"
      onClose={onClose}
      // A click on the dialog element itself, not its contents, is the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[85vh] w-[min(92vw,40rem)] overflow-hidden rounded-2xl bg-card p-0 text-brand-deep shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {quote && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6 sm:px-8 sm:pt-8">
            <Quote
              size={32}
              strokeWidth={1.75}
              className="text-primary/60"
              aria-hidden
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              autoFocus
              className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X size={20} />
            </button>
          </div>
          <blockquote className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 font-display text-lg font-semibold leading-relaxed sm:px-8">
            <p className="whitespace-pre-line">&ldquo;{quote.quote}&rdquo;</p>
          </blockquote>
          <div className="mx-6 mt-5 border-t border-border py-4 text-xs font-semibold text-muted-foreground sm:mx-8 sm:pb-6">
            Student feedback{quote.attribution ? ` · ${quote.attribution}` : ""}
          </div>
        </div>
      )}
    </dialog>
  );
}
