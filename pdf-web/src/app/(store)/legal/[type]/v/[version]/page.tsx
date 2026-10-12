import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { LEGAL_LABEL, legalTypeFromSlug } from "@/lib/legal";
import { getLegalVersion } from "@/lib/server/legal";

/**
 * Rendered per request, never pre-rendered at build time: the build runs in
 * Cloud Build, which cannot reach the private backend (no Cloud Run metadata
 * server there to mint the service-to-service token), so a build-time render
 * would bake in a permanent "could not be loaded" page. The underlying fetch
 * still caches its own result (see src/lib/server/legal.ts), so this costs
 * nothing beyond that.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ type: string; version: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { type: slug, version } = await params;
  const type = legalTypeFromSlug(slug);
  return { title: type ? `${LEGAL_LABEL[type]} v${decodeURIComponent(version)}` : "Not found" };
}

/** One earlier version, exactly as it was published. */
export default async function LegalVersionPage({ params }: { params: Params }) {
  const { type: slug, version } = await params;
  const type = legalTypeFromSlug(slug);
  if (!type) notFound();

  return (
    <LegalDocumentPage
      type={type}
      document={await getLegalVersion(type, decodeURIComponent(version))}
      archived
    />
  );
}
