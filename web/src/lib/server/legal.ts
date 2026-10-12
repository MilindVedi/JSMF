import { LEGAL_APP, type LegalDocument, type LegalDocumentSlug, type LegalVersionSummary } from "@jsmf/core/legal";
import { backendOrigin, getGoogleIdToken } from "./backend";

/** Matches the backend's own Cache-Control: one request a minute, however many readers. */
const REVALIDATE_SECONDS = 60;

/**
 * Legal text is always read from the backend, in mock mode too — there is no
 * mock copy to drift out of date. Null when it cannot be reached; the page
 * then says so rather than showing text that may no longer be in force.
 */
async function getFromBackend<T>(path: string): Promise<T | null> {
  const origin = backendOrigin();
  try {
    const token = await getGoogleIdToken(origin);
    const response = await fetch(`${origin}/api/${path}`, {
      headers: token ? { "X-Serverless-Authorization": `Bearer ${token}` } : {},
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** The version in force now, with only the sections this app shows. */
export function getLegalDocument(slug: LegalDocumentSlug): Promise<LegalDocument | null> {
  return getFromBackend(`legal/documents/${slug}?app=${LEGAL_APP}`);
}

/** One published version by number. */
export function getLegalDocumentVersion(slug: LegalDocumentSlug, version: string): Promise<LegalDocument | null> {
  return getFromBackend(`legal/documents/${slug}/versions/${encodeURIComponent(version)}?app=${LEGAL_APP}`);
}

/** Every published version, newest first. */
export function getLegalVersions(slug: LegalDocumentSlug): Promise<LegalVersionSummary[] | null> {
  return getFromBackend(`legal/documents/${slug}/versions`);
}
