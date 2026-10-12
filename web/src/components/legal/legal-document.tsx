import Link from "next/link";
import {
  formatLegalDate,
  LEGAL_LOAD_ERROR as LOAD_ERROR,
  legalSectionNumber,
  type LegalDocument as LegalDocumentData,
} from "@jsmf/core/legal";
import { LEGAL_PAGE_PATH } from "@/lib/legal";
import { LegalText } from "./legal-text";

/** The page shell every legal document shares, in the style of the other marketing pages. */
export function LegalPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // The same measurements as jsmf.me's and the store's legal pages, so the
    // documents read identically on every JSMF app.
    <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-brand-deep dark:text-foreground">{title}</h1>
      {subtitle && <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function LegalLoadError() {
  return <p className="text-muted-foreground">{LOAD_ERROR}</p>;
}

/**
 * One published version of a document. `fallbackTitle` heads the page when
 * the backend could not be reached; `archived` marks an earlier version.
 */
export function LegalDocumentView({
  document,
  fallbackTitle,
  slug,
  archived = false,
}: {
  document: LegalDocumentData | null;
  fallbackTitle: string;
  slug: "terms" | "privacy" | "refund";
  archived?: boolean;
}) {
  if (!document) {
    return (
      <LegalPageShell title={fallbackTitle}>
        <LegalLoadError />
      </LegalPageShell>
    );
  }

  return (
    <LegalPageShell
      title={document.title}
      subtitle={`Version ${document.version} · Effective ${formatLegalDate(document.effectiveAt)}`}
    >
      {archived && (
        <p className="rounded-2xl border border-border bg-accent px-4 py-3 text-xs font-semibold text-muted-foreground">
          This is an earlier version.{" "}
          <Link href={LEGAL_PAGE_PATH[document.type]} className="font-semibold text-primary">
            View the current one
          </Link>
        </p>
      )}
      {document.sections.map((section, index) => (
        <section key={section.id} className="space-y-3">
          {section.heading && (
            <h2 className="font-display text-lg font-semibold text-brand-deep dark:text-foreground">
              {/* Only headed sections are numbered, the same rule as jsmf.me and the store. */}
              {legalSectionNumber(document.sections, index)}. {section.heading}
            </h2>
          )}
          <LegalText body={section.body} />
        </section>
      ))}
      <p className="pt-4 text-xs">
        <Link href={`/legal/${slug}/versions`} className="text-muted-foreground hover:text-primary">
          Previous versions
        </Link>
      </p>
    </LegalPageShell>
  );
}
