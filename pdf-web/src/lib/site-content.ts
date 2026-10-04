/**
 * Brand and author copy for the public storefront, in one place.
 *
 * Single source so that updating a credential, a social link or the headline is
 * one edit rather than a hunt through components — and so the same details can
 * be lifted into the PYQ app later without being retyped and drifting apart.
 *
 * Everything here is real and sourced from the existing JSMF marketing pages in
 * `web/`. Nothing about a real person is invented: where a detail does not
 * exist yet it is `null` and the UI omits that element entirely, rather than
 * showing filler.
 */

export const brand = {
  name: "JSMF",
  productName: "JSMF Resources",
  headline: "Learn smarter. Revise with confidence.",
  subheadline: "Doctor-led study resources for NEET-PG, FMGE and INI-CET.",
  /** Shown in the footer and on the browse page, where the plainer line fits. */
  tagline: "Study resources for NEET-PG, FMGE and INI-CET.",
  disclaimer:
    "JSMF is not affiliated with NBEMS, AIIMS, or any exam-conducting body.",
  contactEmail: "hello@jsmf.in",
} as const;

/**
 * The address a visitor should actually write to about an order, a refund or
 * anything else — the one on jsmf.me's Contact page and the one every
 * outgoing mail replies to. `contactEmail` above predates this and is left
 * alone because it is referenced from several places; new UI should prefer
 * `supportEmail`.
 */
export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@jsmf.me";

/** The registered/operating address, shared with jsmf.me — the one legal pages and payment providers verify against. */
export const businessAddress = {
  lines: ["Angad Niwas, House No 125, Sector 118", "near TDI Park Street Mall", "S.A.S. Nagar, Mohali, Punjab 160055"],
  mapsUrl: "https://maps.app.goo.gl/MRtfC9ZhCcVppzsu6",
};

/**
 * The main JSMF website. One URL kept in configuration so a staging deploy
 * can point at a staging main-site without a code change. "Visit our main
 * website" links and footer legal links (hosted on jsmf.me) use this base.
 */
export const mainWebsiteUrl =
  process.env.NEXT_PUBLIC_MAIN_SITE_URL?.replace(/\/$/, "") ?? "https://jsmf.me";

/**
 * The main website's hostname — "jsmf.me", "staging.jsmf.me", "localhost:3000"
 * — for user-visible copy that would otherwise hardcode the domain ("live on
 * jsmf.me"). Derived from `mainWebsiteUrl` so a staging deploy says the right
 * thing without a code change. Keeps the port when there is one, because a
 * local host that drops it reads as the production domain.
 */
export const mainWebsiteHost = (() => {
  try {
    return new URL(mainWebsiteUrl).host;
  } catch {
    return "jsmf.me";
  }
})();

export const author = {
  name: "Dr. Angad Rai",
  title: "Founder & Medical Lead",
  /** From the existing hero card in `web/`. */
  qualification: "MBBS, MD — Medical Lead, JSMF",
  credentials: ["AIR 9 · FMGE 2023", "MBBS Bronze Medalist"],
  /**
   * Served from `public/`. Setting this to `null` restores the initials
   * portrait everywhere the photograph appears, with no other change.
   *
   * Stored as a 1024x1536 JPEG (~107KB) rather than the original PNG (~1.7MB):
   * it is a photograph, where JPEG is the right format, and it loads in the
   * hero of the first page a visitor sees — often on mobile data.
   */
  photo: "/dr-angad-rai.jpg" as string | null,
  /**
   * The single achievement shown on the portrait itself, separate from
   * `credentials` because it is the headline one — the rank a visitor should
   * take away if they read nothing else on the page.
   *
   * Deliberately one, not a stack: the badge sits over the photograph, and
   * every additional line there costs the portrait and buys less attention
   * than the one before it. Further credentials belong in the card below,
   * which is built for a list. Set to `null` to remove the badge entirely.
   */
  featuredCredential: "AIR 925 · NEET-PG 2026" as string | null,
  initials: "AR",
  quote: {
    text: "Preparation shouldn't mean solving thousands of random questions. It should mean solving the right questions, understanding why they're right, and knowing exactly what to revise.",
    attribution: "Dr. Angad Rai",
  },
} as const;

export const socials = {
  youtube: "https://www.youtube.com/@Jabstudiesmetfun",
  instagram: "https://www.instagram.com/angadrai009/",
  telegram: "https://t.me/JABSTUDIESMETFUN",
} as const;

/**
 * Social links shared with jsmf.me. `socials` above holds the storefront's
 * historical pair; this is the full set, including Telegram where new
 * sessions are first announced — kept as its own export so adding Telegram
 * here does not reshape the existing `socials` usage.
 */
export const links = {
  telegram: "https://t.me/JABSTUDIESMETFUN",
  youtube: "https://www.youtube.com/@jsmf",
  instagram: "https://www.instagram.com/jsmf",
} as const;

/**
 * The full credential list shown on the doctor-portrait card — same three
 * lines jsmf.me shows, so the two sites tell one consistent story.
 */
export const credentials = [
  "AIR 925 · NEET-PG 2026",
  "AIR 9 · FMGE 2023",
  "MBBS Bronze Medalist",
] as const;
