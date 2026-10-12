import { LegalDocumentView } from "@/components/legal/legal-document";
import { getLegalDocument } from "@/lib/server/legal";

/**
 * Rendered per request, never pre-rendered at build time: the build runs in
 * Cloud Build, which cannot reach the private backend (no Cloud Run metadata
 * server there to mint the service-to-service token), so a build-time render
 * would bake in a permanent "could not be loaded" page. The underlying fetch
 * still caches its own result (see src/lib/server/legal.ts), so this costs
 * nothing beyond that.
 */
export const dynamic = "force-dynamic";

/** The text is published from the admin Legal section; this page only renders it. */
export default async function TermsOfServicePage() {
  const document = await getLegalDocument("terms");
  return <LegalDocumentView document={document} fallbackTitle="Terms of Service" slug="terms" />;
}
