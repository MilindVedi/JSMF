import { Injectable, Logger } from '@nestjs/common';
import { EmailVerificationChannel } from '../infrastructure/email-verification.channel';
import { SmsVerificationChannel } from '../infrastructure/sms-verification.channel';
import { WhatsAppVerificationChannel } from '../infrastructure/whatsapp-verification.channel';
import {
  VerificationChannel,
  VerificationDeliveryError,
  type VerificationAddressKind,
  type VerificationChannelName,
  type VerificationDelivery,
  type VerificationDeliveryFailureReason,
} from '../domain/verification-channel.port';

/**
 * What a caller learns when delivery fails: why, and what the person could do
 * instead — split into two kinds of "instead", because they need different
 * things from the person.
 *
 * - `alternatives` — other channels to **the same destination**. WhatsApp
 *   failed; the same code can go by SMS to the same number. The client just
 *   asks again with `channel: 'sms'`.
 * - `otherRoutes` — address kinds the person could **switch to**. Email
 *   failed; they could continue with a mobile number instead, which means
 *   giving us a number — a different flow, not a retry.
 *
 * Both are derived from the channels actually registered and configured,
 * never hardcoded, so a channel switched on or off changes what is offered
 * everywhere without any flow changing.
 */
export interface VerificationDeliveryFailure {
  reason: VerificationDeliveryFailureReason;
  attempted: VerificationChannelName;
  alternatives: VerificationChannelName[];
  otherRoutes: VerificationAddressKind[];
}

export class VerificationUndeliverableError extends Error {
  constructor(readonly failure: VerificationDeliveryFailure) {
    super(`Could not deliver a verification code over ${failure.attempted}`);
    this.name = 'VerificationUndeliverableError';
  }
}

/** Asked for a channel that cannot carry this kind of destination — a caller bug or a tampered request. */
export class VerificationChannelMismatchError extends Error {
  constructor(channel: VerificationChannelName, addressKind: VerificationAddressKind) {
    super(`The ${channel} channel cannot deliver to a ${addressKind} destination`);
    this.name = 'VerificationChannelMismatchError';
  }
}

/**
 * Chooses a channel, delivers through it, and — when that fails — reports what
 * else was possible.
 *
 * Flows above this one never name a provider and never branch on one. They ask
 * for a code to reach a person and are told either that it did, or why it did
 * not and what the person's remaining options are.
 */
@Injectable()
export class VerificationDeliveryService {
  private readonly logger = new Logger(VerificationDeliveryService.name);

  private readonly channels: VerificationChannel[];

  constructor(
    email: EmailVerificationChannel,
    whatsapp: WhatsAppVerificationChannel,
    sms: SmsVerificationChannel,
  ) {
    // Listed rather than discovered, in preference order *within* each address
    // kind: WhatsApp before SMS because it needs no DLT approval, arrives with
    // a copy-code button, and costs about the same.
    //
    // Registration is not availability — `available()` filters by
    // `isConfigured()`, so a channel appears only where it could send.
    this.channels = [email, whatsapp, sms];
  }

  /** Channels that could carry a code right now, in preference order. */
  available(addressKind?: VerificationAddressKind): VerificationChannelName[] {
    return this.channels
      .filter((channel) => channel.isConfigured())
      .filter((channel) => !addressKind || channel.addressKind === addressKind)
      .map((channel) => channel.name);
  }

  /** The channel to use when the caller has no preference. */
  preferred(addressKind: VerificationAddressKind): VerificationChannelName | null {
    return this.available(addressKind)[0] ?? null;
  }

  /**
   * Delivers over `requested`, or throws `VerificationUndeliverableError`
   * carrying the options.
   *
   * It deliberately does **not** fall back silently, even between WhatsApp and
   * SMS on the same number. Each SMS is paid for, and a code arriving somewhere
   * the person was not told to look is a code they will not find. The client
   * offers "send by SMS instead" and the person chooses.
   */
  async deliver(requested: VerificationChannelName, delivery: VerificationDelivery): Promise<void> {
    const channel = this.channels.find((candidate) => candidate.name === requested);

    if (channel && channel.addressKind !== delivery.addressKind) {
      throw new VerificationChannelMismatchError(requested, delivery.addressKind);
    }

    if (!channel || !channel.isConfigured()) {
      throw new VerificationUndeliverableError(this.failure('error', requested, delivery.addressKind));
    }

    try {
      await channel.deliver(delivery);
    } catch (cause) {
      const reason: VerificationDeliveryFailureReason =
        cause instanceof VerificationDeliveryError ? cause.reason : 'error';
      const failure = this.failure(reason, requested, delivery.addressKind);

      this.logger.warn(
        `Verification code for ${delivery.intent} could not be delivered over ${requested} ` +
          `(${reason}); alternatives: ${failure.alternatives.join(', ') || 'none'}; ` +
          `other routes: ${failure.otherRoutes.join(', ') || 'none'}`,
      );

      throw new VerificationUndeliverableError(failure);
    }
  }

  private failure(
    reason: VerificationDeliveryFailureReason,
    attempted: VerificationChannelName,
    addressKind: VerificationAddressKind,
  ): VerificationDeliveryFailure {
    const alternatives = this.available(addressKind).filter((name) => name !== attempted);
    const otherRoutes = [
      ...new Set(
        this.channels
          .filter((channel) => channel.isConfigured() && channel.addressKind !== addressKind)
          .map((channel) => channel.addressKind),
      ),
    ];

    return { reason, attempted, alternatives, otherRoutes };
  }
}
