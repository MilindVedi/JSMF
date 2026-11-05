import type { Instrumentation } from "next";
import { serverRequestErrorEntry } from "@/lib/observability/error-report";

/**
 * Server-side errors (rendering, route handlers, server actions) as one
 * structured line each, which Cloud Logging files as ERROR and Error
 * Reporting groups under this service. Synchronous and local — stderr, no
 * network — so it cannot slow or fail the request it describes.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  try {
    const entry = serverRequestErrorEntry(error, request, context, {
      // Cloud Run sets both on every instance.
      service: process.env.K_SERVICE ?? "jsmf-web-main",
      version: process.env.K_REVISION ?? "local",
    });
    console.error(JSON.stringify(entry));
  } catch {
    // Logging an error must never raise another one.
  }
};
