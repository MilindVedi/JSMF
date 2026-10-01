import type { Metadata } from "next";
import { BookPage } from "@/components/book-page";
import { externalCheckoutUrl } from "@/lib/external-checkout";

export const metadata: Metadata = {
  title: "Reserve your seat | JSMF",
  description: "Reserve your seat at the next live session with Dr. Angad Rai.",
  alternates: { canonical: "/prep-kit" },
};

export default function BookRoute() {
  return <BookPage checkoutUrl={externalCheckoutUrl()} />;
}
