import type { NextConfig } from "next";

const rawBackendUrl =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

// Ensure trailing slashes and trailing /api are cleanly stripped for the origin
const backendOrigin = rawBackendUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Produces a self-contained `.next/standalone` server with only the
  // dependencies it actually uses traced in — what the Dockerfile copies into
  // the runtime image, instead of shipping the full node_modules tree.
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

