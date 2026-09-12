import type { MetadataRoute } from "next";

/**
 * Blanket "don't index me" for the whole site — this is a pre-launch mock UI
 * shared only via direct link for feedback, not a real public product yet.
 * Paired with `metadata.robots` in the root layout, since some crawlers
 * respect the meta tag more reliably than robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
