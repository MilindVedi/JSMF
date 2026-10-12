/**
 * Reaching the NestJS backend from this app's server side — the /api proxy in
 * middleware and server-rendered pages alike. Works in both the edge and Node
 * runtimes: plain fetch, no Node APIs.
 */

/** Where the backend lives, with any trailing `/api` or slash stripped. */
export function backendOrigin(): string {
  const raw = process.env.BACKEND_API_URL || "http://localhost:4000";
  return raw.replace(/\/api\/?$/, "").replace(/\/+$/, "");
}

/**
 * Cached Google Cloud ID token for service-to-service authentication to a
 * private Cloud Run backend. Refreshed 5 minutes before its ~1h expiry.
 */
let cachedToken: { token: string; expiry: number } | null = null;

/** Null when not on GCP (local dev) or the metadata server is unreachable. */
export async function getGoogleIdToken(audience: string): Promise<string | null> {
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
