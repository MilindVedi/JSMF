import type { LegalDocumentType } from "@jsmf/core/legal";

/**
 * Where each legal document lives in this web app. The documents themselves —
 * types, date format, body parsing — are platform-free and live in
 * `@jsmf/core/legal`.
 */
export const LEGAL_PAGE_PATH: Record<LegalDocumentType, string> = {
  TERMS: "/terms",
  PRIVACY: "/privacy",
  REFUND: "/refund-policy",
};
