/**
 * Everything on the main website that is copy rather than data: links and the
 * facts about Dr. Angad Rai. Session details (date, price, seats) are NOT here
 * — they come from the API, managed in the admin panel at /admin/sessions.
 */
/**
 * Where "Contact us" and every mailto link on the site reaches. Kept in
 * configuration (NEXT_PUBLIC_SUPPORT_EMAIL) so a different brand or a staging
 * deploy can route it elsewhere without a code change. The default is the
 * production address, so an unset variable is a no-op rather than a surprise.
 */
export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@jsmf.me";

/** The registered/operating address shown on Contact Us and About Us, for payment-provider verification. */
export const businessAddress = {
  lines: ["Angad Niwas, House No 125, Sector 118", "near TDI Park Street Mall", "S.A.S. Nagar, Mohali, Punjab 160055"],
  mapsUrl: "https://maps.app.goo.gl/MRtfC9ZhCcVppzsu6",
};

export const links = {
  telegram: "https://t.me/JABSTUDIESMETFUN",
  youtube: "https://www.youtube.com/@jsmf",
  instagram: "https://www.instagram.com/jsmf",
  interviewWatch: "https://www.youtube.com/live/MMLKjFlV1tA",
  interviewEmbed: "https://www.youtube.com/embed/MMLKjFlV1tA",
  /** The PDF store, where the planner that comes with a seat appears. */
  store: process.env.NEXT_PUBLIC_STORE_URL ?? "https://store.jsmf.me",
};

export const credentials = [
  "AIR 925 · NEET-PG 2026",
  "AIR 9 · FMGE 2023",
  "MBBS Bronze Medalist",
];
