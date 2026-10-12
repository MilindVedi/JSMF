import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { getLegalDocument } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Refund & Cancellation Policy" };

/** The text is published from the admin Legal section; this page only renders it. */
export default async function RefundPolicyPage() {
  const document = await getLegalDocument("refund");
  return <LegalDocumentView document={document} fallbackTitle="Refund & Cancellation Policy" slug="refund" />;
}
