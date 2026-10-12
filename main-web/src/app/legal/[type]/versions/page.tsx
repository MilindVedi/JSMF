import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { LegalUnavailable } from "@/components/legal/legal-document";
import { LEGAL_PAGE_PATH, isLegalSlug } from "@/lib/api/legal";
import { plainDateLabel } from "@/lib/format";
import { getLegalVersions } from "@/lib/server/legal";

export const metadata: Metadata = { title: "Previous versions — JSMF" };

export const revalidate = 60;

/** Every published version of one document, newest first — each links to its full text. */
export default async function LegalVersionsPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isLegalSlug(type)) notFound();

  const versions = await getLegalVersions(type);
  const title = versions?.[0]?.title ?? "Previous versions";

  return (
    <LegalPage title={title} meta="Every published version, newest first.">
      {!versions ? (
        <LegalUnavailable />
      ) : (
        <LegalSection>
          <ul className="space-y-4">
            {versions.map((version) => (
              <li key={version.version} className="border-b border-border pb-4 last:border-0">
                <Link href={`/legal/${type}/v/${encodeURIComponent(version.version)}`} className="font-semibold text-primary">
                  Version {version.version}
                </Link>
                <span className="text-xs text-muted-foreground"> · Effective {plainDateLabel(version.effectiveAt)}</span>
                {version.changeSummary && <p className="mt-1 text-muted-foreground">{version.changeSummary}</p>}
              </li>
            ))}
          </ul>
          <p className="pt-2 text-xs">
            <Link href={LEGAL_PAGE_PATH[type]} className="text-muted-foreground hover:text-primary">
              Back to the current version
            </Link>
          </p>
        </LegalSection>
      )}
    </LegalPage>
  );
}
