import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { LEGAL_PAGE_PATH, isLegalSlug } from "@/lib/api/legal";
import { getLegalVersion } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Earlier version — JSMF" };

/**
 * Rendered per request, never pre-rendered at build time: the build runs in
 * Cloud Build, which cannot reach the private backend (no Cloud Run metadata
 * server there to mint the service-to-service token), so a build-time render
 * would bake in a permanent "could not be loaded" page. The underlying fetch
 * still caches its own result (see src/lib/server/legal.ts), so this costs
 * nothing beyond that.
 */
export const dynamic = "force-dynamic";

/** One archived version of a document, exactly as it was published. */
export default async function LegalVersionPage({
  params,
}: {
  params: Promise<{ type: string; version: string }>;
}) {
  const { type, version } = await params;
  if (!isLegalSlug(type)) notFound();

  return (
    <LegalDocumentView
      document={await getLegalVersion(type, decodeURIComponent(version))}
      slug={type}
      fallbackTitle={`Version ${decodeURIComponent(version)}`}
      notice={
        <>
          This is an earlier version.{" "}
          <Link href={LEGAL_PAGE_PATH[type]} className="text-primary">
            View the current one
          </Link>
        </>
      }
    />
  );
}
