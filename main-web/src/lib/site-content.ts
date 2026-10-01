/**
 * Everything on the main website that is copy rather than data: links and the
 * facts about Dr. Angad Rai. Session details (date, price, seats) are NOT here
 * — they come from the API, managed in the admin panel at /admin/sessions.
 */
export const supportEmail = "support@jsmf.me";

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
