"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { currentOffering, type MentorshipOffering } from "@/lib/api/mentorship";

/**
 * The home page's invitation to a one-to-one call. Renders nothing until an
 * offering is published (or if it cannot be loaded), so the home page looks
 * exactly as it did before the feature existed until an admin switches it on.
 */
export function MentorshipBanner() {
  const [offering, setOffering] = useState<MentorshipOffering | null>(null);

  useEffect(() => {
    void currentOffering().then(setOffering);
  }, []);

  if (!offering) return null;

  return (
    <section className="border-b border-border bg-accent/50 py-16">
      {/* Right padding up to 2xl keeps the button clear of the fixed "Join us
          on Telegram" pill, which sits at the vertical centre of the right
          edge and would otherwise cover it while this section scrolls past. */}
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 md:flex-row md:items-center md:justify-between lg:px-8 lg:pr-36 2xl:pr-8">
        <div>
          <span className="eyebrow">One-to-one mentorship</span>
          <h2 className="mt-5 font-display text-3xl font-semibold leading-tight text-brand-deep md:text-4xl">
            Want a plan made just for you?
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Book a private {offering.durationMinutes}-minute call with Dr. Angad — review your preparation and leave
            with clear next steps.
          </p>
        </div>
        <Link href="/mentorship" className={buttonVariants({ size: "lg", className: "shrink-0" })}>
          Book a 1:1 session
        </Link>
      </div>
    </section>
  );
}
