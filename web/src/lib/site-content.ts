/**
 * Contact details and channels, the same as jsmf.me (main-web/src/lib/site-content.ts);
 * apps never import each other's source, so keep the two in step.
 */
export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@jsmf.me";

/** The registered/operating address shown on Contact Us, for payment-provider verification. */
export const businessAddress = {
  lines: ["Angad Niwas, House No 125, Sector 118", "near TDI Park Street Mall", "S.A.S. Nagar, Mohali, Punjab 160055"],
  mapsUrl: "https://maps.app.goo.gl/MRtfC9ZhCcVppzsu6",
};

export const links = {
  telegram: "https://t.me/JABSTUDIESMETFUN",
  youtube: "https://www.youtube.com/@DrAngadRai",
  instagram: "https://www.instagram.com/drangadrai09/",
};

/** jsmf.me — linked from the header, the same crossover the store has. */
export const mainWebsiteUrl = process.env.NEXT_PUBLIC_MAIN_WEBSITE_URL ?? "https://jsmf.me";

/**
 * The PDF store, where the study resources live — the same crossover jsmf.me
 * carries, worded "Study Resources" on both. (The store's own name is still
 * "JSMF Resources"; that is its title, not the way in.) Kept in step with
 * main-web's `links.store`.
 */
export const storeUrl = process.env.NEXT_PUBLIC_STORE_URL ?? "https://resources.jsmf.me";
