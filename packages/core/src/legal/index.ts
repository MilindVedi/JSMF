/**
 * Legal documents (terms, privacy, refund) as the backend publishes them —
 * shared by web's server-rendered pages, its client-side acceptance gate and
 * the mobile app. Platform-free: where each document lives in an app (web's
 * routes) and how a body is drawn (React DOM / React Native) stay in the app;
 * the rules for reading a body are here so both apps render it the same way.
 */

/** This app's id on the backend: sections can be shown on some apps only. */
export const LEGAL_APP = "PYQ";

export type LegalDocumentSlug = "terms" | "privacy" | "refund";
export type LegalDocumentType = "TERMS" | "PRIVACY" | "REFUND";

export interface LegalSection {
  id: string;
  heading: string;
  body: string;
  apps: string[];
}

export interface LegalDocument {
  id: string;
  type: LegalDocumentType;
  version: string;
  title: string;
  sections: LegalSection[];
  changeKind: "MAJOR" | "MINOR";
  changeSummary: string | null;
  effectiveAt: string;
  publishedAt: string;
}

export type LegalVersionSummary = Pick<
  LegalDocument,
  "version" | "title" | "changeKind" | "changeSummary" | "effectiveAt" | "publishedAt"
>;

/** The page heading when the backend cannot be reached. */
export const LEGAL_DEFAULT_TITLE: Record<LegalDocumentType, string> = {
  TERMS: "Terms of Service",
  PRIVACY: "Privacy Policy",
  REFUND: "Refund & Cancellation Policy",
};

export function legalSlugToType(slug: string): LegalDocumentType | null {
  return slug === "terms" || slug === "privacy" || slug === "refund"
    ? (slug.toUpperCase() as LegalDocumentType)
    : null;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** "1 October 2026" — fixed to IST so server and browser agree. */
export function formatLegalDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/**
 * The number shown before a section heading: only headed sections are
 * numbered (the same rule as jsmf.me and the store). Null for an unheaded one.
 */
export function legalSectionNumber(sections: Pick<LegalSection, "heading">[], index: number): number | null {
  if (!sections[index]?.heading) return null;
  return sections.slice(0, index + 1).filter((s) => s.heading).length;
}

// --- Body text -----------------------------------------------------------------
//
// A section body is plain text written in the admin editor, never HTML, and is
// turned into elements by each app's renderer only — so nothing an editor
// types can inject markup:
//
// - blank lines separate blocks;
// - a block whose every line starts with "- " is a bulleted list;
// - any other block is a paragraph (single newlines become spaces);
// - `[text](url)` is a link when the url starts with `/`, `https://` or
//   `mailto:` (anything else stays plain text), and `**text**` is bold.

export type LegalBlock = { kind: "list"; items: string[] } | { kind: "paragraph"; text: string };

export function parseLegalBody(body: string): LegalBlock[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block): LegalBlock => {
      const lines = block.split("\n").map((line) => line.trim());
      if (lines.every((line) => line.startsWith("- "))) {
        return { kind: "list", items: lines.map((line) => line.slice(2)) };
      }
      return { kind: "paragraph", text: lines.join(" ") };
    });
}

/** `internal` = an app path (`/terms`), `external` = https, `mailto` = email. */
export type LegalLinkKind = "internal" | "external" | "mailto";

export function legalLinkKind(url: string): LegalLinkKind | null {
  if (url.startsWith("/") && !url.startsWith("//")) return "internal";
  if (url.startsWith("https://")) return "external";
  if (url.startsWith("mailto:")) return "mailto";
  return null;
}

/** `start` is the token's offset in the line: a stable key for renderers. */
export type LegalInline =
  | { kind: "text"; start: number; text: string }
  | { kind: "bold"; start: number; text: string }
  | { kind: "link"; start: number; label: string; url: string; linkKind: LegalLinkKind };

/** Links and bold inside one line of text; a link to a disallowed url stays as its raw text. */
export function parseLegalInline(text: string): LegalInline[] {
  const parts: LegalInline[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", start: last, text: text.slice(last, start) });
    const [whole, label, url, bold] = match;
    if (bold !== undefined) parts.push({ kind: "bold", start, text: bold });
    else {
      const linkKind = legalLinkKind(url);
      parts.push(linkKind ? { kind: "link", start, label, url, linkKind } : { kind: "text", start, text: whole });
    }
    last = start + whole.length;
  }
  if (last < text.length) parts.push({ kind: "text", start: last, text: text.slice(last) });
  return parts;
}

/** How the acceptance gate words each document's checkbox (web and mobile). */
export const LEGAL_AGREEMENT: Record<LegalDocumentType, { lead: string; label: string }> = {
  TERMS: { lead: "I agree to the", label: "Terms of Service" },
  PRIVACY: { lead: "I have read the", label: "Privacy Policy" },
  REFUND: { lead: "I have read the", label: "Refund & Cancellation Policy" },
};

/** Shown when a legal document cannot be loaded. */
export const LEGAL_LOAD_ERROR =
  "This document could not be loaded right now. Please try again shortly, or contact support@jsmf.me.";
