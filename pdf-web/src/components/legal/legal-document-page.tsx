import Link from "next/link";
import { LegalHeading, LegalSections } from "@/components/legal/legal-text";
import { LEGAL_LABEL, LEGAL_PAGE, LEGAL_SLUG, type LegalDocumentType, type PublishedLegalVersion } from "@/lib/legal";
import { supportEmail } from "@/lib/site-content";

/** The shell every policy page shares, so the five routes cannot drift apart in layout. */
export function LegalShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">{children}</div>;
}

/** Said instead of the document when the backend could not be reached. */
export function LegalUnavailable({ title }: { title: string }) {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold text-brand-deep">{title}</h1>
      <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
        This document could not be loaded right now. Please try again shortly, or contact{" "}
        <a href={`mailto:${supportEmail}`} className="font-semibold text-primary">
          {supportEmail}
        </a>
        .
      </p>
    </>
  );
}

/**
 * One of the three policy pages: the current version, or an earlier one when
 * `archived` (with a pointer back to the version in force).
 */
export function LegalDocumentPage({
  type,
  document,
  archived = false,
}: {
  type: LegalDocumentType;
  document: PublishedLegalVersion | null;
  archived?: boolean;
}) {
  return (
    <LegalShell>
      {!document ? (
        <LegalUnavailable title={LEGAL_LABEL[type]} />
      ) : (
        <>
          {archived && (
            <p className="mb-6 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              This is an earlier version.{" "}
              <Link href={LEGAL_PAGE[type]} className="font-semibold text-primary">
                View the current one
              </Link>
            </p>
          )}
          <LegalHeading title={document.title} version={document.version} effectiveAt={document.effectiveAt} />
          <div className="mt-8">
            <LegalSections sections={document.sections} />
          </div>
          <p className="mt-10 text-xs">
            <Link
              href={`/legal/${LEGAL_SLUG[type]}/versions`}
              className="text-muted-foreground hover:text-primary"
            >
              Previous versions
            </Link>
          </p>
        </>
      )}
    </LegalShell>
  );
}
