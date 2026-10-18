"use client";

import { Quote, Star } from "lucide-react";
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

          {(section.quotes?.length ?? 0) > 0 && <QuoteCards quotes={section.quotes!} />}

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

/**
 * Written replies, two or three across on wide screens. Long ones are cut to
 * a few lines with the full text a tap away, so one essay does not push the
 * rest out of sight.
 */
function QuoteCards({ quotes }: { quotes: SectionQuote[] }) {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {quotes.map((item) => (
        <figure key={item.id} className="flex flex-col rounded-2xl border border-brand-line bg-white/5 p-5">
          {item.rating !== null && (
            <div className="mb-3 flex gap-0.5" aria-label={`${item.rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={14}
                  className={n <= item.rating! ? "fill-amber-300 text-amber-300" : "text-white/25"}
                  aria-hidden
                />
              ))}
            </div>
          )}
          <blockquote className="flex-1">
            <details className="group">
              <summary className="cursor-pointer list-none text-[15px] leading-relaxed opacity-90 [&::-webkit-details-marker]:hidden">
                <span className="line-clamp-5 group-open:line-clamp-none">&ldquo;{item.quote}&rdquo;</span>
              </summary>
            </details>
          </blockquote>
          <figcaption className="mt-4 text-xs font-semibold uppercase tracking-wide opacity-70">
            {item.attribution}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
