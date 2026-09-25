import type { MetadataRoute } from "next";

/**
 * Configures robots.txt for search engine crawlers.
 * Allows indexing of the public product site.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
