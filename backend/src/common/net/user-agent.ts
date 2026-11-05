/**
 * Crawlers, link previewers and scripts announce themselves. Their "visits"
 * are not people and their "errors" are not ours, so the public intake routes
 * (analytics, client errors) store nothing from them. An empty agent counts
 * as automated: every real browser and app sends one.
 */
export function isBotUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless|phantomjs|python-requests|curl\/|wget/i.test(
    userAgent,
  );
}
