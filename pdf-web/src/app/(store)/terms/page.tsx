import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Terms & Conditions" };

/** Re-read from the backend at most once a minute — a newly effective version shows up within that. */
export const revalidate = 60;

export default async function TermsPage() {
  return <LegalDocumentPage type="TERMS" document={await getLegalDocument("TERMS")} />;
}
