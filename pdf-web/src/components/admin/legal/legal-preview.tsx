"use client";

import { LegalHeading, LegalSections } from "@/components/legal/legal-text";
import { sectionsFor, type JsmfApp, type LegalSection } from "@/lib/legal";

/**
 * A document as one app shows it — the storefront's own renderer, on the
 * sections that app keeps. Without `version` it is a draft, so it says so
 * instead of inventing a number or a date.
 */
export function LegalPreview({
  title,
  sections,
  app,
  version,
  effectiveAt,
}: {
  title: string;
  sections: LegalSection[];
  app: JsmfApp;
  version?: string | null;
  effectiveAt?: string | null;
}) {
  const shown = sectionsFor(sections, app);

  return (
    <div className="rounded-xl border border-border bg-background px-5 py-8 sm:px-8">
      {version && effectiveAt ? (
        <LegalHeading title={title} version={version} effectiveAt={effectiveAt} />
      ) : (
        <>
          <h1 className="font-display text-3xl font-semibold text-brand-deep">{title || "Untitled"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Draft · not yet published</p>
        </>
      )}
      <div className="mt-8">
        {shown.length > 0 ? (
          <LegalSections sections={shown} />
        ) : (
          <p className="text-sm text-muted-foreground">This app shows no sections of this document.</p>
        )}
      </div>
    </div>
  );
}
