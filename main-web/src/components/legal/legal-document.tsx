import type { ReactNode } from "react";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { LegalText } from "@/components/legal/legal-text";
import type { LegalDocument, LegalSlug } from "@/lib/api/legal";
import { plainDateLabel } from "@/lib/format";
import { supportEmail } from "@/lib/site-content";

/**
 * One version of a legal document as published on the backend, or — when it
 * could not be fetched — the page shell with a note saying so. Never a stale
 * hardcoded copy: that would be a policy nobody published.
 */
export function LegalDocumentView({
  document,
  slug,
  fallbackTitle,
  notice,
}: {
  document: LegalDocument | null;
  slug: LegalSlug;
  /** The page title while the document itself is unavailable. */
  fallbackTitle: string;
  /** Shown above the text, e.g. on an archived version. */
  notice?: ReactNode;
}) {
  if (!document) {
    return (
      <LegalPage title={fallbackTitle}>
        <LegalUnavailable />
      </LegalPage>
    );
  }

  let number = 0;

  return (
    <LegalPage
      title={document.title}
      meta={`Version ${document.version} · Effective ${plainDateLabel(document.effectiveAt)}`}
    >
      {notice && (
        <p className="rounded-2xl border border-border bg-accent px-4 py-3 text-xs font-semibold text-muted-foreground">
          {notice}
        </p>
      )}
      {document.sections.map((section) => {
        const heading = section.heading.trim();
        return (
          <LegalSection key={section.id} heading={heading ? `${++number}. ${heading}` : undefined}>
            <LegalText body={section.body} />
          </LegalSection>
        );
      })}
      <p className="pt-4 text-xs">
        <Link href={`/legal/${slug}/versions`} className="text-muted-foreground hover:text-primary">
          Previous versions
        </Link>
      </p>
    </LegalPage>
  );
}

export function LegalUnavailable() {
  return (
    <p>
      This document could not be loaded right now. Please try again shortly, or contact{" "}
      <a href={`mailto:${supportEmail}`} className="font-semibold text-primary">
        {supportEmail}
      </a>
      .
    </p>
  );
}
