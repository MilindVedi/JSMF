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
