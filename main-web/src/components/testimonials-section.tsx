"use client";

import { Quote } from "lucide-react";
import { TestimonialGallery } from "@/components/testimonial-gallery";
import type { LiveSession, NoSessionTestimonials } from "@/lib/api/types";

/**
 * What past attendees said, on its own light band. The heading and
 * subheading fall back to generic defaults when the session has not set them;
 * the small tag on the right is left out entirely when unset — an empty
 * "chip" with a dangling border reads as broken decoration, not deliberate
 * restraint. The row of screenshots and the lightbox are TestimonialGallery,
 * shared with the session's own feedback in the booking band.
 *
 * Shared by the home page (`landing.tsx`) and `/prep-kit` (`book-page.tsx`).
 */
export function TestimonialsSection({ session }: { session: LiveSession }) {
  return (
    <TestimonialsBand
      urls={session.testimonialUrls}
      heading={session.testimonialsHeading || "What students said after the last session."}
      subheading={
        session.testimonialsSubheading ||
        "From a previous revision session held before the FMGE exam. A few moments students shared afterward."
      }
      tag={session.testimonialsTag}
    />
  );
}

/**
 * The same band while no session is upcoming: the screenshots and copy the
 * admin chose for that case (Sessions → "When no session is upcoming").
 */
export function NoSessionTestimonialsSection({ testimonials }: { testimonials: NoSessionTestimonials }) {
  return <TestimonialsBand urls={testimonials.urls} heading={testimonials.heading} subheading={testimonials.subheading} />;
}

function TestimonialsBand({
  urls,
  heading,
  subheading,
  tag = null,
}: {
  urls: string[];
  heading: string;
  subheading: string;
  tag?: string | null;
}) {
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
              {heading}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{subheading}</p>
          </div>
          {/* Optional, so it is left out entirely when unset — an empty tag
              with a dangling border reads as broken, not minimal. */}
          {tag && (
            <span className="flex items-center gap-2 border-l-2 border-primary pl-3 text-[11px] font-bold uppercase tracking-wide text-primary">
              {tag}
            </span>
          )}
        </div>

        <div className="mt-10">
          <TestimonialGallery urls={urls} imageAlt="A message from a student about the previous session" />
        </div>
      </div>
    </section>
  );
}
