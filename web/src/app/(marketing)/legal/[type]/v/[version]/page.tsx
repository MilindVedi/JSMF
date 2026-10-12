import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { LEGAL_DEFAULT_TITLE, legalSlugToType } from "@jsmf/core/legal";
import { getLegalDocumentVersion } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Earlier version" };

/** One earlier published version, exactly as this app showed it. */
export default async function LegalVersionPage({ params }: { params: Promise<{ type: string; version: string }> }) {
  const { type: slug, version } = await params;
  const type = legalSlugToType(slug);
  if (!type) notFound();

  const typedSlug = slug as "terms" | "privacy" | "refund";
  const document = await getLegalDocumentVersion(typedSlug, decodeURIComponent(version));
  return <LegalDocumentView document={document} fallbackTitle={LEGAL_DEFAULT_TITLE[type]} slug={typedSlug} archived />;
}
