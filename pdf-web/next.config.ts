import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained `.next/standalone` server with only the
  // dependencies it actually uses traced in — what the Dockerfile copies into
  // the runtime image, instead of shipping the full node_modules tree.
  output: "standalone",

  // Every /api/* call is proxied to the backend by src/middleware.ts, and Next
  // buffers a proxied request body only up to 10MB by default, cutting off
  // the rest. A PDF upload larger than that arrives truncated and the
  // backend sees "Request aborted". Keep this at or above the backend's
  // MAX_UPLOAD_SIZE_MB (the real limit, enforced there with a clear message).
  experimental: {
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;

