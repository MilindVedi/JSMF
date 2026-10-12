import {
  THIS_APP,
  type LegalDocumentType,
  LEGAL_SLUG,
  type PublishedLegalVersion,
  type PublishedLegalVersionSummary,
} from "@/lib/legal";

/**
 * The legal documents, read from the backend on the server so the policy
 * pages are real HTML for visitors and crawlers alike (Razorpay's reviewers
 * included) rather than a spinner.
 *
 * This calls the backend directly rather than through the /api proxy in
 * middleware — a server component has no browser origin to proxy from — so it
 * repeats what that proxy does: the base URL from BACKEND_API_URL, and a
 * Google ID token for the private Cloud Run backend when on GCP.
 */

/** Matches the backend's own Cache-Control on these endpoints. */
const REVALIDATE_SECONDS = 60;

function backendOrigin(): string {
  const raw = process.env.BACKEND_API_URL || "http://localhost:4000";
  return raw.replace(/\/api\/?$/, "").replace(/\/+$/, "");
}

let cachedToken: { token: string; expiry: number } | null = null;

/** Null when not on GCP (local dev) or the metadata server is unreachable. */
async function getGoogleIdToken(audience: string): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiry) return cachedToken.token;

  try {
    const url = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
    const res = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
    if (!res.ok) return null;
    const token = await res.text();
    cachedToken = { token, expiry: Date.now() + 55 * 60 * 1000 };
    return token;
  } catch {
    return null;
  }
}

/**
 * Null when the backend cannot be reached or answers with an error. The page
 * then says so — it never falls back to text that may no longer be in force.
 */
async function getJson<T>(path: string): Promise<T | null> {
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

/** The version in force now, with only the sections this storefront shows. */
export function getLegalDocument(type: LegalDocumentType) {
  return getJson<PublishedLegalVersion>(`legal/documents/${LEGAL_SLUG[type]}?app=${THIS_APP}`);
}

/** Every published version, newest first, without the text. */
export function getLegalVersions(type: LegalDocumentType) {
  return getJson<PublishedLegalVersionSummary[]>(`legal/documents/${LEGAL_SLUG[type]}/versions`);
}

/** One earlier (or the current) published version by its number. */
export function getLegalVersion(type: LegalDocumentType, version: string) {
  return getJson<PublishedLegalVersion>(
    `legal/documents/${LEGAL_SLUG[type]}/versions/${encodeURIComponent(version)}?app=${THIS_APP}`,
  );
}
