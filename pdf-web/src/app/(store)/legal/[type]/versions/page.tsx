import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalShell, LegalUnavailable } from "@/components/legal/legal-document-page";
import { formatLegalDate, LEGAL_LABEL, LEGAL_PAGE, legalTypeFromSlug } from "@/lib/legal";
import { getLegalVersions } from "@/lib/server/legal";

/**
 * Rendered per request, never pre-rendered at build time: the build runs in
 * Cloud Build, which cannot reach the private backend (no Cloud Run metadata
 * server there to mint the service-to-service token), so a build-time render
 * would bake in a permanent "could not be loaded" page. The underlying fetch
 * still caches its own result (see src/lib/server/legal.ts), so this costs
 * nothing beyond that.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ type: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const type = legalTypeFromSlug((await params).type);
  return { title: type ? `${LEGAL_LABEL[type]} — previous versions` : "Not found" };
}

/** Every published version of one document, so anyone can read what they agreed to. */
export default async function LegalVersionsPage({ params }: { params: Params }) {
  const { type: slug } = await params;
  const type = legalTypeFromSlug(slug);
  if (!type) notFound();

  const versions = await getLegalVersions(type);
  if (!versions) {
    return (
      <LegalShell>
        <LegalUnavailable title={LEGAL_LABEL[type]} />
      </LegalShell>
    );
  }

  return (
    <LegalShell>
      <h1 className="font-display text-3xl font-semibold text-brand-deep">{LEGAL_LABEL[type]}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every published version.{" "}
        <Link href={LEGAL_PAGE[type]} className="font-semibold text-primary">
          View the current one
        </Link>
      </p>

      <ul className="mt-8 divide-y divide-border border-y border-border">
        {versions.map((version) => (
          <li key={version.version} className="py-4">
            <Link
              href={`/legal/${slug}/v/${encodeURIComponent(version.version)}`}
              className="text-sm font-semibold text-foreground hover:text-primary"
            >
              Version {version.version}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Effective {formatLegalDate(version.effectiveAt)}
            </p>
            {version.changeSummary && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{version.changeSummary}</p>
            )}
          </li>
        ))}
      </ul>
    </LegalShell>
  );
}
