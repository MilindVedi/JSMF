/**
 * Terms, Privacy and Refund as the backend versions them — the shapes and
 * names every legal screen shares, storefront and admin alike.
 */

export type LegalDocumentType = "TERMS" | "PRIVACY" | "REFUND";

/** The JSMF apps a section can be limited to. Empty `apps` means all of them. */
export type JsmfApp = "MAIN" | "PYQ" | "STORE";

export type LegalChangeKind = "MAJOR" | "MINOR";

/** This app, as the backend knows it. */
export const THIS_APP: JsmfApp = "STORE";

export interface LegalSection {
  id: string;
  heading: string;
  /** Plain text: blank lines for paragraphs, "- " bullets, [text](url) links. */
  body: string;
  apps: JsmfApp[];
}

/** A published version as the public endpoints return it. */
export interface PublishedLegalVersion {
  id: string;
  type: LegalDocumentType;
  version: string;
  title: string;
  sections: LegalSection[];
  changeKind: LegalChangeKind;
  changeSummary: string | null;
  effectiveAt: string;
  publishedAt: string;
}

export interface PublishedLegalVersionSummary {
  version: string;
  title: string;
  changeKind: LegalChangeKind;
  changeSummary: string | null;
  effectiveAt: string;
  publishedAt: string;
}

export const LEGAL_TYPES: LegalDocumentType[] = ["TERMS", "PRIVACY", "REFUND"];

/** What each document is called wherever a title is not to hand. */
export const LEGAL_LABEL: Record<LegalDocumentType, string> = {
  TERMS: "Terms of Service",
  PRIVACY: "Privacy Policy",
  REFUND: "Refund & Cancellation Policy",
};

/** The URL segment the backend accepts for each type (`legal/documents/:type`). */
export const LEGAL_SLUG: Record<LegalDocumentType, string> = {
  TERMS: "terms",
  PRIVACY: "privacy",
  REFUND: "refund",
};

/** Where this storefront shows each document. */
export const LEGAL_PAGE: Record<LegalDocumentType, string> = {
  TERMS: "/terms",
  PRIVACY: "/privacy",
  REFUND: "/refund-policy",
};

export const APP_LABEL: Record<JsmfApp, string> = {
  MAIN: "jsmf.me",
  PYQ: "PYQs",
  STORE: "Store",
};

/** "terms" → "TERMS"; null for anything else, so a bad URL can 404. */
export function legalTypeFromSlug(slug: string): LegalDocumentType | null {
  const type = slug.toUpperCase();
  return (LEGAL_TYPES as string[]).includes(type) ? (type as LegalDocumentType) : null;
}

/** "11 October 2026" — how an effective date reads on a document. */
export function formatLegalDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    // Fixed to India time, as on jsmf.me and PYQs: the server's clock is UTC,
    // which would otherwise show the previous day for anything after 18:30 UTC.
    timeZone: "Asia/Kolkata",
  });
}

/** The sections one app shows — the same rule the backend applies. */
export function sectionsFor(sections: LegalSection[], app: JsmfApp): LegalSection[] {
  return sections.filter((section) => section.apps.length === 0 || section.apps.includes(app));
}
