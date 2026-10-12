import { createHash } from 'node:crypto';
import { JsmfApp, LegalAcceptanceKind, LegalChangeKind, LegalDocumentType } from '@prisma/client';

/**
 * One section of a legal document. `apps` empty means every JSMF app shows it;
 * otherwise only the listed ones do — so one document, and one version number,
 * covers the shared terms and each app's own additions.
 *
 * `body` is plain text, never HTML: blank lines separate paragraphs, lines
 * starting "- " are bullets, and [text](url) is a link. The apps render it as
 * React text, so nothing in a document can inject markup.
 */
export interface LegalSection {
  id: string;
  heading: string;
  body: string;
  apps: JsmfApp[];
}

/** What a user does to each document: agree to the contract, or confirm they were shown a policy. */
export const ACCEPTANCE_KIND: Record<LegalDocumentType, LegalAcceptanceKind> = {
  TERMS: LegalAcceptanceKind.ACCEPTED,
  PRIVACY: LegalAcceptanceKind.ACKNOWLEDGED,
  REFUND: LegalAcceptanceKind.ACKNOWLEDGED,
};

/**
 * The documents a user must be up to date with when LEGAL_ACCEPTANCE_REQUIRED
 * is on. Refund is acknowledged at checkout instead, per order.
 */
export const REQUIRED_DOCUMENTS: LegalDocumentType[] = [LegalDocumentType.TERMS, LegalDocumentType.PRIVACY];

/** "1.4" + MINOR = "1.5"; "1.4" + MAJOR = "2.0"; no previous version = "1.0". */
export function nextVersion(previous: string | null, kind: LegalChangeKind): string {
  if (!previous) return '1.0';
  const [major, minor] = previous.split('.').map(Number);
  return kind === LegalChangeKind.MAJOR ? `${major + 1}.0` : `${major}.${minor + 1}`;
}

/** Sort key for "1.10" > "1.9", which string order gets wrong. */
export function versionOrder(version: string): number {
  const [major, minor] = version.split('.').map(Number);
  return major * 100_000 + minor;
}

/**
 * sha256 over the exact text a user sees, fixed at publish. Keys are written in
 * a fixed order so the same content always hashes the same.
 */
export function contentHash(title: string, sections: LegalSection[]): string {
  const canonical = JSON.stringify({
    title,
    sections: sections.map((s) => ({ heading: s.heading, body: s.body, apps: [...s.apps].sort() })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** The sections one app shows. */
export function sectionsFor(sections: LegalSection[], app: JsmfApp | undefined): LegalSection[] {
  if (!app) return sections;
  return sections.filter((s) => s.apps.length === 0 || s.apps.includes(app));
}

/** Trims text and drops duplicate app tags, so cosmetic noise never makes a "new" version. */
export function normaliseSections(sections: LegalSection[]): LegalSection[] {
  return sections.map((s) => ({
    id: s.id,
    heading: s.heading.trim(),
    body: s.body.replace(/\r\n/g, '\n').trim(),
    apps: [...new Set(s.apps)],
  }));
}
