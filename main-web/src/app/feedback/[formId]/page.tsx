import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedbackPage } from "@/components/feedback/feedback-page";

export const metadata: Metadata = {
  title: "Your feedback | JSMF",
  // Personal links: never indexed, and never leaked to another site as a referrer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function FeedbackRoute({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  // Suspense: the page reads the `k` token from the URL's query string.
  return (
    <Suspense>
      <FeedbackPage formId={formId} />
    </Suspense>
  );
}
