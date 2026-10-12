import { LEGAL_APP, type LegalDocument, type LegalSlug, type LegalVersionSummary } from "@/lib/api/legal";

/**
 * Legal documents for the server-rendered policy pages. The text is managed in
 * the admin panel and versioned on the backend, so these pages fetch it rather
 * than carrying a copy — a stale copy here would be a policy nobody published.
 *
 * Each returns null when the backend cannot be reached or has nothing
 * published; the page then says so instead of guessing.
 */

/** Matches the backend's own Cache-Control: one request per minute, however many visitors. */
const REVALIDATE_SECONDS = 60;

function backendOrigin(): string {
  const raw = process.env.BACKEND_API_URL || "http://localhost:4000";
  return raw.replace(/\/api\/?$/, "").replace(/\/+$/, "");
}

/**
 * The same service-to-service ID token src/middleware.ts attaches to proxied
 * calls — the backend is a private Cloud Run service. Null off GCP.
 */
let cachedToken: { token: string; expiry: number } | null = null;

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

async function getLegal<T>(path: string): Promise<T | null> {
  const origin = backendOrigin();
  try {
    const token = await getGoogleIdToken(origin);
    const response = await fetch(`${origin}/api/legal/${path}`, {
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

export function getLegalDocument(slug: LegalSlug): Promise<LegalDocument | null> {
  return getLegal<LegalDocument>(`documents/${slug}?app=${LEGAL_APP}`);
}

export function getLegalVersions(slug: LegalSlug): Promise<LegalVersionSummary[] | null> {
  return getLegal<LegalVersionSummary[]>(`documents/${slug}/versions`);
}

export function getLegalVersion(slug: LegalSlug, version: string): Promise<LegalDocument | null> {
  return getLegal<LegalDocument>(`documents/${slug}/versions/${encodeURIComponent(version)}?app=${LEGAL_APP}`);
}
