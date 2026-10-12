import { LegalDocumentView } from "@/components/legal/legal-document";
import { getLegalDocument } from "@/lib/server/legal";

/** The text is published from the admin Legal section; this page only renders it. */
export default async function TermsOfServicePage() {
  const document = await getLegalDocument("terms");
  return <LegalDocumentView document={document} fallbackTitle="Terms of Service" slug="terms" />;
}
