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

export interface SessionLanding {
  upcoming: LiveSession | null;
  previous: LiveSession | null;
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
