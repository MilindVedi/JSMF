import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { LEGAL_PAGE_PATH, isLegalSlug } from "@/lib/api/legal";
import { getLegalVersion } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Earlier version — JSMF" };

export const revalidate = 60;

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
