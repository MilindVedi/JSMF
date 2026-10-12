import { LegalDocumentView } from "@/components/legal/legal-document";
import { getLegalDocument } from "@/lib/server/legal";

/** The text is published from the admin Legal section; this page only renders it. */
export default async function PrivacyPolicyPage() {
  const document = await getLegalDocument("privacy");
  return <LegalDocumentView document={document} fallbackTitle="Privacy Policy" slug="privacy" />;
}
