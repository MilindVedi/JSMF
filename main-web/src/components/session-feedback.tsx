"use client";

import { Quote } from "lucide-react";
import { TestimonialGallery } from "@/components/testimonial-gallery";
import type { LiveSession, SectionQuote } from "@/lib/api/types";

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
export function SessionFeedback({ session, className = "" }: { session: LiveSession; className?: string }) {
  const sections = session.testimonialSections ?? [];
  if (sections.length === 0) return null;

  return (
    <div className={`space-y-14 ${className}`}>
      {sections.map((section) => (
        <div key={section.id}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-line px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                <Quote size={13} /> {section.dayNumber ? `Day ${section.dayNumber} feedback` : "In their own words"}
              </span>
              <h3 className="mt-5 max-w-2xl font-display text-2xl font-semibold leading-tight md:text-3xl">
                {section.heading}
              </h3>
              {section.subheading && (
                <p className="mt-3 max-w-2xl text-base leading-relaxed opacity-80">{section.subheading}</p>
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
              <QuoteCards quotes={section.quotes!} />
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
    featured: "bg-primary text-white shadow-editorial",
    card: "border border-brand-line bg-white/5",
    icon: "text-primary",
    rule: "border-brand-line",
    caption: "opacity-70",
  },
  // On the light testimonials band: the featured card in deep purple, the rest white.
  light: {
    featured: "bg-brand-deep text-white shadow-editorial",
    card: "border border-border bg-card text-brand-deep",
    icon: "text-primary/60",
    rule: "border-border",
    caption: "text-muted-foreground",
  },
} as const;

/**
 * Written replies, as pulled-quote cards: two or three across on wide
 * screens, in their own row above any screenshots, so neither has to match
 * the other's size. Cards in a row share one height, with the divider and
 * name at the bottom. The first is featured. A long reply shows five lines
 * and opens in full on a tap.
 *
 * Shared by the booking band here and the light testimonials band.
 */
export function QuoteCards({ quotes, tone = "dark" }: { quotes: SectionQuote[]; tone?: keyof typeof QUOTE_TONES }) {
  const style = QUOTE_TONES[tone];
  return (
    // While one long reply is open, only that card grows; the others keep their size.
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 has-[details[open]]:items-start">
      {quotes.map((item, index) => {
        const featured = index === 0;
        const long = item.quote.length > LONG_QUOTE;
        const text = <>&ldquo;{item.quote}&rdquo;</>;
        return (
          <figure key={item.id} className={`flex flex-col rounded-2xl p-6 ${featured ? style.featured : style.card}`}>
            <Quote
              size={28}
              strokeWidth={1.75}
              className={`mb-4 shrink-0 ${featured ? "text-white/80" : style.icon}`}
              aria-hidden
            />
            <blockquote className="flex-1 font-display text-[17px] font-semibold leading-snug">
              {long ? (
                <details className="group">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="line-clamp-5 group-open:line-clamp-none">{text}</span>
                    <span className="mt-2 inline-block font-sans text-xs font-semibold underline underline-offset-4 opacity-75">
                      <span className="group-open:hidden">Read more</span>
                      <span className="hidden group-open:inline">Show less</span>
                    </span>
                  </summary>
                </details>
              ) : (
                <p>{text}</p>
              )}
            </blockquote>
            <hr className={`mt-6 border-0 border-t ${featured ? "border-white/20" : style.rule}`} />
            <figcaption
              className={`mt-4 text-xs font-semibold ${featured ? "text-white/75" : style.caption}`}
            >
              Student feedback{item.attribution ? ` · ${item.attribution}` : ""}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
