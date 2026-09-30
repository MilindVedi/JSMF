import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Cached Google Cloud ID token for service-to-service authentication.
 * Tokens from the metadata server are valid for ~1 hour;
 * we refresh 5 minutes early to avoid edge-case expiry during a request.
 */
let cachedToken: { token: string; expiry: number } | null = null;

/**
 * Fetches a Google Cloud ID token from the instance metadata server.
 * Only works when running on GCP (Cloud Run, GCE, GKE, etc.).
 * Returns null when running locally or if the fetch fails.
 */
async function getGoogleIdToken(audience: string): Promise<string | null> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiry) {
    return cachedToken.token;
  }

  try {
    const url =
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
    const res = await fetch(url, {
      headers: { "Metadata-Flavor": "Google" },
    });

    if (!res.ok) return null;

    const token = await res.text();

    // Cache for 55 minutes (tokens are valid for ~60 min)
    cachedToken = {
      token,
      expiry: Date.now() + 55 * 60 * 1000,
    };

    return token;
  } catch {
    // Not on GCP (local dev) — skip service-to-service auth
    return null;
  }
}

/**
 * No canonical-host redirect lives here, and that is a deliberate conclusion
 * rather than an omission.
 *
 * The app answers on more than one hostname — the custom domain and the Cloud
 * Run `*.run.app` URL behind it — and the obvious fix is to 301 the second to
 * the first. It cannot be done from inside this app, for a reason that only
 * shows up when measured against the deployed service:
 *
 * 1. Firebase Hosting proxies to Cloud Run with the `Host` header **rewritten**
 *    to the `.run.app` name. A request to the custom domain appears in Cloud
 *    Run's own logs as `https://jsmf-pdf-web-….run.app/…`, so `Host` cannot
 *    tell a legitimate visitor from someone hitting the bare Cloud Run URL.
 * 2. `x-forwarded-host` looks like the way out, but Next.js **synthesises** it
 *    from `Host` when no proxy supplied one — so it reports the `.run.app`
 *    name as well, and does it in a way indistinguishable from a real proxy
 *    header.
 *
 * Either signal therefore matches *every* request, and a redirect keyed on one
 * would bounce the whole site to the canonical domain, back through Firebase,
 * into the same check again — an infinite loop taking the site down, rather
 * than the narrow correction it was meant to be.
 *
 * What replaces it: `alternates.canonical` in the root layout, which puts a
 * `<link rel="canonical">` naming the real domain on every page regardless of
 * which hostname served it. That solves the part that actually matters —
 * search engines indexing one address — and carries no such risk. Genuinely
 * closing the second door is an infrastructure change (ingress restriction or
 * a load balancer), not an application one.
 */
export async function middleware(request: NextRequest) {
  // Only intercept requests to /api/*
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const rawBackendUrl =
      process.env.BACKEND_API_URL || "http://localhost:4000";

    // Clean up backend URL
    const backendOrigin = rawBackendUrl
      .replace(/\/api\/?$/, "")
      .replace(/\/+$/, "");

    // Construct the target URL
    const targetUrl = `${backendOrigin}${request.nextUrl.pathname}${request.nextUrl.search}`;

    // Fetch Google Cloud ID token for IAM-authenticated service-to-service calls.
    // On local dev this returns null and the header is simply skipped.
    const idToken = await getGoogleIdToken(backendOrigin);

    // Clone request headers and inject the ID token
    const requestHeaders = new Headers(request.headers);
    if (idToken) {
      // X-Serverless-Authorization is used by Cloud Run for IAM auth,
      // leaving the standard Authorization header free for the app's
      // own JWT user authentication.
      requestHeaders.set(
        "X-Serverless-Authorization",
        `Bearer ${idToken}`,
      );
    }

    return NextResponse.rewrite(targetUrl, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  // Match all request paths that start with /api/
  matcher: "/api/:path*",
};
