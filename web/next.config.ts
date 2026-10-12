import path from "node:path";
import type { NextConfig } from "next";

/**
 * The repo root: web/ is an npm workspace next to packages/core, and its
 * dependencies are installed in the root node_modules.
 */
const workspaceRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // Produces a self-contained `.next/standalone` server with only the
  // dependencies it actually uses traced in — what the Dockerfile copies into
  // the runtime image, instead of shipping the full node_modules tree.
  output: "standalone",
  // Trace from the workspace root so the hoisted node_modules and
  // packages/core are included. The standalone output then mirrors the repo
  // layout: `.next/standalone/web/server.js` (see Dockerfile).
  outputFileTracingRoot: workspaceRoot,
  // Turbopack (next build) must resolve files outside web/ too; kept equal to
  // the tracing root, as Next requires.
  turbopack: { root: workspaceRoot },
  // @jsmf/core ships TypeScript source, not a build; Next compiles it.
  transpilePackages: ["@jsmf/core"],
};

export default nextConfig;
