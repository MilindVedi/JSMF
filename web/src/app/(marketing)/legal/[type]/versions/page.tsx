import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalLoadError, LegalPageShell } from "@/components/legal/legal-document";
import { formatLegalDate, LEGAL_DEFAULT_TITLE, legalSlugToType } from "@jsmf/core/legal";
import { LEGAL_PAGE_PATH } from "@/lib/legal";
import { getLegalVersions } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Previous versions" };

/**
 * Rendered per request, never pre-rendered at build time: the build runs in
 * Cloud Build, which cannot reach the private backend (no Cloud Run metadata
 * server there to mint the service-to-service token), so a build-time render
 * would bake in a permanent "could not be loaded" page. The underlying fetch
 * still caches its own result (see src/lib/server/legal.ts), so this costs
 * nothing beyond that.
 */
export const dynamic = "force-dynamic";

/** Every published version of one document, so anyone can read what was in force when. */
export default async function LegalVersionsPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: slug } = await params;
  const type = legalSlugToType(slug);
  if (!type) notFound();

  const versions = await getLegalVersions(slug as "terms" | "privacy" | "refund");
  const title = versions?.[0]?.title ?? LEGAL_DEFAULT_TITLE[type];

  return (
    <LegalPageShell
      title={title}
      subtitle={
        <>
          All published versions.{" "}
          <Link href={LEGAL_PAGE_PATH[type]} className="font-medium text-primary underline-offset-4 hover:underline">
            View the current one
          </Link>
        </>
      }
    >
      {!versions ? (
        <LegalLoadError />
      ) : (
        <ul className="divide-y divide-border">
          {versions.map((version) => (
            <li key={version.version} className="py-4 first:pt-0">
              <Link
                href={`/legal/${slug}/v/${encodeURIComponent(version.version)}`}
                className="font-display font-semibold text-brand-deep underline-offset-4 hover:underline dark:text-foreground"
              >
                Version {version.version}
              </Link>
              <p className="text-sm text-muted-foreground">Effective {formatLegalDate(version.effectiveAt)}</p>
              {version.changeSummary && <p className="mt-1 text-sm">{version.changeSummary}</p>}
            </li>
          ))}
        </ul>
      )}
    </LegalPageShell>
  );
}
