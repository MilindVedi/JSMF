import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Only intercept requests to /api/*
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const rawBackendUrl =
      process.env.BACKEND_API_URL || "http://localhost:4000";

    // Clean up backend URL to ensure no double slashes or trailing /api
    const backendOrigin = rawBackendUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");
    
    // Construct the target URL (e.g., https://backend/api/catalog/products)
    const targetUrl = `${backendOrigin}${request.nextUrl.pathname}${request.nextUrl.search}`;

    return NextResponse.rewrite(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all request paths that start with /api/
  matcher: "/api/:path*",
};
