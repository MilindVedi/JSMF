import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { LEGAL_DEFAULT_TITLE, legalSlugToType } from "@jsmf/core/legal";
import { getLegalDocumentVersion } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Earlier version" };

/**
 * Rendered per request, never pre-rendered at build time: the build runs in
 * Cloud Build, which cannot reach the private backend (no Cloud Run metadata
 * server there to mint the service-to-service token), so a build-time render
 * would bake in a permanent "could not be loaded" page. The underlying fetch
 * still caches its own result (see src/lib/server/legal.ts), so this costs
 * nothing beyond that.
 */
export const dynamic = "force-dynamic";

/** One earlier published version, exactly as this app showed it. */
export default async function LegalVersionPage({ params }: { params: Promise<{ type: string; version: string }> }) {
  const { type: slug, version } = await params;
  const type = legalSlugToType(slug);
  if (!type) notFound();

  const typedSlug = slug as "terms" | "privacy" | "refund";
  const document = await getLegalDocumentVersion(typedSlug, decodeURIComponent(version));
  return <LegalDocumentView document={document} fallbackTitle={LEGAL_DEFAULT_TITLE[type]} slug={typedSlug} archived />;
}
