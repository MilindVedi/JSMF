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

export const author = {
  name: "Dr. Angad Rai",
  title: "Founder & Medical Lead",
  /** From the existing hero card in `web/`. */
  qualification: "MBBS, MD — Medical Lead, JSMF",
  credentials: ["AIR 9 · FMGE 2023", "MBBS Bronze Medalist"],
  /**
   * No photograph exists in the repository yet, so the UI falls back to the
   * initials portrait — the same approach `web/` takes. Set this to a path
   * under `public/` (e.g. `/dr-angad-rai.jpg`) and the real image is used with
   * no other change.
   */
  photo: null as string | null,
  initials: "AR",
  quote: {
    text: "Preparation shouldn't mean solving thousands of random questions. It should mean solving the right questions, understanding why they're right, and knowing exactly what to revise.",
    attribution: "Dr. Angad Rai",
  },
} as const;

export const socials = {
  youtube: "https://www.youtube.com/@Jabstudiesmetfun",
  instagram: "https://www.instagram.com/angadrai009/",
} as const;
