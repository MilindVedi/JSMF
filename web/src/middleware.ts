import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Pre-launch gate: this mock UI is shared with one reviewer at a time for
 * feedback, not yet a public product (see README "Current stage"). Basic
 * Auth here is a stopgap against the deployed URL leaking/being crawled by
 * something noindex doesn't stop — not a real auth system, and cheap to
 * delete once real authentication exists.
 *
 * Set MOCK_UI_BASIC_AUTH_USER / MOCK_UI_BASIC_AUTH_PASSWORD in Vercel's
 * Environment Variables. If either is unset (e.g. local dev), the gate is
 * skipped entirely so `npm run dev` keeps working with no setup.
 */
export function middleware(request: NextRequest) {
  const user = process.env.MOCK_UI_BASIC_AUTH_USER;
  const password = process.env.MOCK_UI_BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separatorIndex);
    const suppliedPassword = decoded.slice(separatorIndex + 1);
    if (suppliedUser === user && suppliedPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="JSMF preview"' },
  });
}

export const config = {
  // Every request except static assets/framework internals, and the
  // opengraph-image route specifically — chat-app link unfurlers fetch that
  // without credentials, so gating it would just break the share preview
  // for no real security benefit (it's a generic brand image, not content).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|opengraph-image).*)"],
};
