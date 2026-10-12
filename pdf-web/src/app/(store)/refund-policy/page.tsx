import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Refund & Cancellation Policy" };

/**
 * Rendered per request, never pre-rendered at build time: the build runs in
 * Cloud Build, which cannot reach the private backend (no Cloud Run metadata
 * server there to mint the service-to-service token), so a build-time render
 * would bake in a permanent "could not be loaded" page. The underlying fetch
 * still caches its own result (see src/lib/server/legal.ts), so this costs
 * nothing beyond that.
 */
export const dynamic = "force-dynamic";

export default async function RefundPolicyPage() {
  return <LegalDocumentPage type="REFUND" document={await getLegalDocument("REFUND")} />;
}
