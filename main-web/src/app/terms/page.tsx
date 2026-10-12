import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { getLegalDocument } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Terms & Conditions — JSMF" };

/** The text is published from the admin panel; see src/lib/server/legal.ts. */
export const revalidate = 60;

export default async function TermsPage() {
  return <LegalDocumentView document={await getLegalDocument("terms")} slug="terms" fallbackTitle="Terms & Conditions" />;
}
