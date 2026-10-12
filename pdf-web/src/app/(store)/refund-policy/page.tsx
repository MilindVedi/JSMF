import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Refund & Cancellation Policy" };

/** Re-read from the backend at most once a minute — a newly effective version shows up within that. */
export const revalidate = 60;

export default async function RefundPolicyPage() {
  return <LegalDocumentPage type="REFUND" document={await getLegalDocument("REFUND")} />;
}
