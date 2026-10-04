import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Two jobs, kept separate:
 *
 * 1. `/api/*` is forwarded to the NestJS backend (same proxy as main-web's
 *    middleware, copied — apps never import each other's source). The browser
 *    only ever talks to this origin, so the API needs no CORS for this app.
 *    It is *not* behind the preview gate below, matching main-web: the API
 *    authenticates every request itself with bearer tokens.
 *
 * 2. Everything else sits behind the pre-launch Basic Auth gate — a stopgap
 *    against the preview URL leaking or being crawled, not real auth. Set
 *    MOCK_UI_BASIC_AUTH_USER / MOCK_UI_BASIC_AUTH_PASSWORD to enable it; if
 *    either is unset (local dev), the gate is skipped entirely.
 */

/**
 * Cached Google Cloud ID token for service-to-service authentication to a
 * private Cloud Run backend. Refreshed 5 minutes before its ~1h expiry.
 */
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

async function proxyToBackend(request: NextRequest) {
  const rawBackendUrl = process.env.BACKEND_API_URL || "http://localhost:4000";
  const backendOrigin = rawBackendUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  const targetUrl = `${backendOrigin}${request.nextUrl.pathname}${request.nextUrl.search}`;

  const requestHeaders = new Headers(request.headers);
  // Marks the request as having come through a public frontend. Set, never
  // copied, so a caller cannot strip it; the backend refuses /internal routes
  // that carry it (InternalOnlyGuard).
  requestHeaders.set(VIA_FRONTEND_HEADER, "1");
  const idToken = await getGoogleIdToken(backendOrigin);
  if (idToken) {
    // Cloud Run IAM reads X-Serverless-Authorization, leaving Authorization
    // free for the app's own user JWT.
    requestHeaders.set("X-Serverless-Authorization", `Bearer ${idToken}`);
  }

  return NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } });
}

function basicAuthGate(request: NextRequest) {
  const user = process.env.MOCK_UI_BASIC_AUTH_USER;
  const password = process.env.MOCK_UI_BASIC_AUTH_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separatorIndex);
    const suppliedPassword = decoded.slice(separatorIndex + 1);
    if (suppliedUser === user && suppliedPassword === password) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="JSMF preview"' },
  });
}

/** Must match VIA_FRONTEND_HEADER in backend/src/common/guards/internal-only.guard.ts. */
const VIA_FRONTEND_HEADER = "x-jsmf-via-frontend";

/**
 * `/api/internal/*` is for Cloud Scheduler, which calls the backend directly
 * with its own identity. Proxying it would attach this app's IAM token and let
 * anyone on the internet trigger those jobs. Decoded and slash-collapsed first
 * so `/api//internal` or `/api/%69nternal` cannot slip past; a path that will
 * not decode is refused outright.
 */
function isInternalPath(pathname: string): boolean {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  return /^\/api\/internal(\/|$)/i.test(path.replace(/\/{2,}/g, "/"));
}

export async function middleware(request: NextRequest) {
  if (isInternalPath(request.nextUrl.pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (request.nextUrl.pathname.startsWith("/api/")) return proxyToBackend(request);
  return basicAuthGate(request);
}

export const config = {
  // Every request except static assets/framework internals, and the
  // opengraph-image route — link unfurlers fetch it without credentials.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|opengraph-image).*)"],
};
