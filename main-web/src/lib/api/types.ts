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
  startsAt: string;
  durationMinutes: number;
  platformLabel: string;
  highlights: string[];
  perkText: string | null;
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  currency: string;
  capacity: number | null;
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
  whatsappNumber: string;
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
