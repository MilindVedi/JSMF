import { api } from "./client";

/** This site's id on the backend: which sections of each document it shows, and where an acceptance came from. */
export const LEGAL_APP = "MAIN";

export type LegalDocumentType = "TERMS" | "PRIVACY" | "REFUND";
export type LegalChangeKind = "MAJOR" | "MINOR";

/** How each document is named in URLs, on the backend and on this site. */
export const LEGAL_SLUGS = ["terms", "privacy", "refund"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

/** Where the current version of each document lives on this site. */
export const LEGAL_PAGE_PATH: Record<LegalSlug, string> = {
  terms: "/terms",
  privacy: "/privacy",
  refund: "/refund-policy",
};

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export function slugOf(type: LegalDocumentType): LegalSlug {
  return type.toLowerCase() as LegalSlug;
}

export interface LegalSection {
  id: string;
  heading: string;
  /** Plain text — see components/legal/legal-text.tsx for the format. */
  body: string;
  apps: string[];
}

export interface LegalDocument {
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

export type LegalVersionSummary = Pick<
  LegalDocument,
  "version" | "title" | "changeKind" | "changeSummary" | "effectiveAt" | "publishedAt"
>;

export interface LegalStatus {
  /** Whether the server blocks anyone at all; `required` below already accounts for it. */
  enforced: boolean;
  documents: Array<{
    type: LegalDocumentType;
    current: Pick<LegalDocument, "version" | "title" | "effectiveAt" | "changeKind" | "changeSummary">;
    accepted: { version: string; acceptedAt: string } | null;
    upToDate: boolean;
    hasUpdate: boolean;
    required: boolean;
  }>;
}

export const legalApi = {
  me: () => api.get<LegalStatus>("/legal/me"),

  /** The server records whichever version is current; a version is never sent. */
  accept: (documents: LegalDocumentType[], context: "SIGNUP" | "RE_ACCEPT") =>
    api.post<{ recorded: Array<{ type: LegalDocumentType; version: string; acceptedAt: string }> }>(
      "/legal/accept",
      { documents, app: LEGAL_APP, context },
    ),
};
