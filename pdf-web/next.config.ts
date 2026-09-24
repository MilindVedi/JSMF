import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained `.next/standalone` server with only the
  // dependencies it actually uses traced in — what the Dockerfile copies into
  // the runtime image, instead of shipping the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
