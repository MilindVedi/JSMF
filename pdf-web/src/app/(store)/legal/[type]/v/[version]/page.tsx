import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { LEGAL_LABEL, legalTypeFromSlug } from "@/lib/legal";
import { getLegalVersion } from "@/lib/server/legal";

/** A published version never changes, so this can be cached far longer than the current one. */
export const revalidate = 3600;

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
