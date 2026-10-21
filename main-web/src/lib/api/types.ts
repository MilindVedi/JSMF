export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  roles: string[];
}

export interface AuthSession {
  user: AuthUser;
  tokens: { accessToken: string; refreshToken: string };
}

/** A session as the public API returns it. Money is paise, as a string. */
/** One named testimonial gallery on a session's pages. */
export interface TestimonialSection {
  id: string;
  heading: string;
  subheading: string | null;
  /** Small label beside the heading; null hides it. */
  tag: string | null;
  /** Which day of the session it is about (1-based), or null. */
  dayNumber: number | null;
  urls: string[];
  /** Written replies picked from the feedback form. Optional: older APIs send none. */
  quotes?: SectionQuote[];
}

/** A student's written reply, shown as a card. */
export interface SectionQuote {
  id: string;
  quote: string;
  /** "Riya · Final year", or "A JSMF student". */
  attribution: string;
  /** 1 to 5 stars, or null for none. */
  rating: number | null;
}

export interface LiveSession {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  /** The first day's start. Null when the dates have not been fixed yet. */
  startsAt: string | null;
  /** In start order; one entry for a one-day session, empty when undated. */
  days: Array<{ startsAt: string; durationMinutes: number }>;
  platformLabel: string;
  highlights: string[];
  perkText: string | null;
  /** "Who is this session for?" — null hides the section. */
  audienceText: string | null;
  /** Testimonials section copy. Null falls back to a generic default. */
  testimonialsHeading: string | null;
  testimonialsSubheading: string | null;
  testimonialsTag: string | null;
  /** Testimonial screenshots, in display order. Empty hides the section. */
  testimonialUrls: string[];
  /**
   * Named galleries beside the original one — "What students said after
   * Day 1". Only visible sections with at least one image, in display order.
   * Optional so a page still renders against an API that predates them.
   */
  testimonialSections?: TestimonialSection[];
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  currency: string;
  capacity: number | null;
  /** Temporary external-checkout scarcity number. Null = no line, 0 = fully booked. */
  displaySeats: number | null;
  seatsRemaining: number | null;
  registrationOpen: boolean;
  recordingUrl: string | null;
  included: Array<{ title: string }>;
}

/**
 * How the written replies are laid out: "SCROLL" is one row that scrolls
 * sideways (the default), "GRID" wraps them onto as many lines as it takes.
 * Set in the admin panel and used everywhere replies appear.
 */
export type QuoteLayout = "SCROLL" | "GRID";

export interface SessionLanding {
  upcoming: LiveSession | null;
  previous: LiveSession | null;
  /** Absent from an older API, which means the scrolling row. */
  quotesLayout?: QuoteLayout;
  /** Set only while nothing is upcoming: the testimonials the admin chose for that case. */
  noSessionTestimonials?: NoSessionTestimonials | null;
}

export interface NoSessionTestimonials {
  heading: string;
  subheading: string;
  urls: string[];
  /** Replies picked for the band. Absent from an older API. */
  quotes?: SectionQuote[];
}

export interface RegistrationAnswers {
  /** A contact number on file. Nothing sends WhatsApp or SMS to it today. */
  whatsappNumber?: string;
  exam: string;
  stage: string;
}

export interface MyRegistration {
  registered: boolean;
  answers: RegistrationAnswers | null;
}

export type CheckoutResult =
  | { kind: "FREE"; orderId: string; orderNumber: string; productId: string }
  | {
      kind: "PAYMENT_REQUIRED";
      orderId: string;
      orderNumber: string;
      amountMinor: string;
      currency: string;
      providerOrderId: string;
      checkoutKeyId: string;
    };
