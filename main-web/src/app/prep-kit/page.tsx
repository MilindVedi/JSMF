import { Suspense } from "react";
import type { Metadata } from "next";
import { BookPage } from "@/components/book-page";
import { externalCheckoutUrl } from "@/lib/external-checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reserve your seat | JSMF",
  description: "Reserve your seat at the next live session with Dr. Angad Rai.",
  alternates: { canonical: "/prep-kit" },
};

export default function BookRoute() {
  // Suspense because BookPage reads `?register=1` (set when Google sign-in
  // returns someone mid-registration), and search params suspend in Next.
  return (
    <Suspense>
      <BookPage checkoutUrl={externalCheckoutUrl()} />
    </Suspense>
  );
}
