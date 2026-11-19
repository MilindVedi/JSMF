import { Suspense } from "react";
import type { Metadata } from "next";
import { MentorshipPage } from "@/components/mentorship/mentorship-page";

export const metadata: Metadata = {
  title: "Book a 1:1 session with Dr. Angad | JSMF",
  description:
    "A private one-to-one Personal Development Session with Dr. Angad Rai — for exam pressure, focus, motivation, or anything you need to talk through.",
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
