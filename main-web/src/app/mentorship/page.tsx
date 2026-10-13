import { Suspense } from "react";
import type { Metadata } from "next";
import { MentorshipPage } from "@/components/mentorship/mentorship-page";

export const metadata: Metadata = {
  title: "Book a 1:1 session with Dr. Angad | JSMF",
  description: "A private 45-minute call with Dr. Angad Rai to review your preparation and leave with a plan made for you.",
  alternates: { canonical: "/mentorship" },
};

export default function MentorshipRoute() {
  // Suspense because the page reads `?slot=` (the time picked before signing in).
  return (
    <Suspense>
      <MentorshipPage />
    </Suspense>
  );
}
