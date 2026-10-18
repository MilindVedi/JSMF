"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { currentOffering, type MentorshipOffering } from "@/lib/api/mentorship";

/**
 * The hero's second call to action: a one-to-one call with Dr. Angad, under
 * "Book Your Spot Now", in the same animated purple style (.cta-spot) so the
 * two read as a pair. The fuller invitation further down the page
 * (MentorshipBanner) is unchanged.
 *
 * Renders nothing until an offering is published, like the banner; the
 * offering request is shared, so this costs no extra call.
 */
export function MentorshipHeroCta({ className = "" }: { className?: string }) {
  const [offering, setOffering] = useState<MentorshipOffering | null>(null);

  useEffect(() => {
    void currentOffering().then(setOffering);
  }, []);

  if (!offering) return null;

  return (
    <Link
      href="/mentorship"
      className={`cta-spot flex w-full max-w-md flex-col items-center justify-center rounded-full px-8 py-3 text-center text-white ${className}`}
    >
      <span className="cta-shine" aria-hidden />
      <span className="flex items-center gap-2.5 font-display text-lg font-semibold leading-tight">
        <CalendarCheck size={18} /> Book a 1:1 session
        <ArrowRight size={18} strokeWidth={2.4} className="cta-arrow" />
      </span>
      <span className="mt-0.5 text-xs font-normal opacity-80">
        Private {offering.durationMinutes}-minute call with Dr. Angad
      </span>
    </Link>
  );
}
