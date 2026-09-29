/**
 * How a one-time code reaches the person it is for.
 *
 * `VerificationCodeService` already owns *what* a code is and whether it is
 * still valid; this owns *delivery*, which is the part that differs per medium
 * and — more importantly — the part that fails. Separating them is what lets a
 * failed send be answered with "try another way" instead of "signup is broken":
 * the code is already issued and still valid, so a second channel can carry the
 * same one.
 *
 * Three channels exist — email, WhatsApp and SMS — and each was added as one
 * class implementing this interface plus one entry in the registry. No flow
 * above changed when they were, because no flow above knows which channel it
 * used.
 */

/** Extend as channels are added; the union is what keeps registries exhaustive. */
export type VerificationChannelName = 'email' | 'whatsapp' | 'sms';

/**
 * What kind of destination a channel delivers to.
 *
 * Channels sharing an address kind are interchangeable for one person — the
 * same code can go by WhatsApp or SMS to the same number. Channels with
 * different kinds are not: switching from email to phone means the person
 * has to give us a different destination, which is a different *route*.
 */
export type VerificationAddressKind = 'email' | 'phone';

/**
 * What a code is for, in delivery terms. Deliberately not Prisma's
 * `VerificationPurpose`: that enum also covers codes nobody receives
 * (`OAUTH_HANDOFF`), and a channel should only ever be handed something it can
 * actually address to a person.
 */
export type VerificationIntent = 'signup' | 'password-reset' | 'sign-in' | 'phone-link';

export interface VerificationDelivery {
  intent: VerificationIntent;
  /** The plaintext code. Never logged, never persisted beyond its hash. */
  code: string;
  /** An email address or E.164 phone digits, matching `addressKind`. */
  destination: string;
  /**
   * Declared by the caller and checked against the channel, so a flow that
   * holds a phone number can never hand it to the email channel, whatever
   * channel a client asked for.
   */
  addressKind: VerificationAddressKind;
  /** Used to address the message when known — absent for password reset. */
  name?: string;
  /** How long the recipient has, so the message can say so accurately. */
  expiresInMinutes: number;
}

/**
 * Why a delivery failed, in the only two shapes a caller can act on
 * differently.
 *
 * `quota` is not a bug and will not resolve by retrying in a minute — the
 * allowance is gone until the window resets, so the honest answer is another
 * channel or a later attempt. `error` may well be transient, so retrying is
 * reasonable advice. Conflating them would mean telling someone to "try again
 * shortly" when nothing they do will work until tomorrow.
 */
export type VerificationDeliveryFailureReason = 'quota' | 'error';

export class VerificationDeliveryError extends Error {
  constructor(
    message: string,
    readonly reason: VerificationDeliveryFailureReason,
    readonly channel: VerificationChannelName,
  ) {
    super(message);
    this.name = 'VerificationDeliveryError';
  }
}

export abstract class VerificationChannel {
  abstract readonly name: VerificationChannelName;
  abstract readonly addressKind: VerificationAddressKind;

  /**
   * Whether this channel could be used at all right now — credentials present,
   * feature switched on. Distinct from whether a given send succeeds: this
   * answers "is it worth offering to the user as an alternative", and offering
   * a route that is not configured is worse than offering none.
   */
  abstract isConfigured(): boolean;

  /**
   * Delivers, or throws `VerificationDeliveryError`. Must not throw anything
   * else: the caller's whole purpose is to translate a failure into an
   * alternative, and an unclassified error cannot be translated.
   */
  abstract deliver(delivery: VerificationDelivery): Promise<void>;
}
