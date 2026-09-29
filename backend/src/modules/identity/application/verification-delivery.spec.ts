import { describe, expect, it } from 'vitest';
import {
  VerificationChannel,
  VerificationDeliveryError,
  type VerificationAddressKind,
  type VerificationChannelName,
  type VerificationDelivery,
} from '../domain/verification-channel.port';
import { messageFor } from '../http/delivery-failure.http';
import {
  VerificationChannelMismatchError,
  VerificationDeliveryService,
  VerificationUndeliverableError,
} from './verification-delivery.service';

/**
 * These tests protect one claim: that what a person is offered after a failed
 * send follows from which channels are switched on — never from anything
 * hardcoded in a flow.
 *
 * That claim quietly stops being true in ordinary ways: a `catch` that drops
 * the reason, an `alternatives: []` added somewhere convenient. The channels
 * here are fakes, because what is under test is the choosing and reporting,
 * not any transport.
 */

class FakeChannel extends VerificationChannel {
  readonly sent: VerificationDelivery[] = [];
  readonly addressKind: VerificationAddressKind;

  constructor(
    readonly name: VerificationChannelName,
    private readonly behaviour: 'ok' | 'quota' | 'error' | 'unconfigured',
  ) {
    super();
    this.addressKind = name === 'email' ? 'email' : 'phone';
  }

  isConfigured(): boolean {
    return this.behaviour !== 'unconfigured';
  }

  async deliver(delivery: VerificationDelivery): Promise<void> {
    if (this.behaviour === 'quota') {
      throw new VerificationDeliveryError('allowance gone', 'quota', this.name);
    }
    if (this.behaviour === 'error') {
      throw new VerificationDeliveryError('provider refused', 'error', this.name);
    }
    this.sent.push(delivery);
  }
}

function serviceWith(
  email: FakeChannel,
  whatsapp = new FakeChannel('whatsapp', 'unconfigured'),
  sms = new FakeChannel('sms', 'unconfigured'),
): VerificationDeliveryService {
  return new VerificationDeliveryService(email as never, whatsapp as never, sms as never);
}

const toEmail: VerificationDelivery = {
  intent: 'signup',
  code: '123456',
  destination: 'buyer@example.com',
  addressKind: 'email',
  name: 'Buyer',
  expiresInMinutes: 15,
};

const toPhone: VerificationDelivery = {
  intent: 'sign-in',
  code: '654321',
  destination: '919876543210',
  addressKind: 'phone',
  expiresInMinutes: 15,
};

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(VerificationUndeliverableError);
  return (error as VerificationUndeliverableError).failure;
}

describe('verification delivery', () => {
  it('delivers over the requested channel', async () => {
    const email = new FakeChannel('email', 'ok');
    await serviceWith(email).deliver('email', toEmail);

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].code).toBe('123456');
  });

  describe('when email fails', () => {
    it('offers nothing else while no phone channel is on', async () => {
      const failure = await failureOf(
        serviceWith(new FakeChannel('email', 'quota')).deliver('email', toEmail),
      );

      expect(failure).toEqual({ reason: 'quota', attempted: 'email', alternatives: [], otherRoutes: [] });
    });

    it('offers the mobile route the moment a phone channel is on', async () => {
      // No flow changed to make this happen — only which channel is configured.
      const failure = await failureOf(
        serviceWith(new FakeChannel('email', 'quota'), new FakeChannel('whatsapp', 'ok')).deliver(
          'email',
          toEmail,
        ),
      );

      // A route, not an alternative: the person has to give us a number.
      expect(failure.alternatives).toEqual([]);
      expect(failure.otherRoutes).toEqual(['phone']);
    });

    it('never silently sends to a phone instead', async () => {
      const whatsapp = new FakeChannel('whatsapp', 'ok');
      await failureOf(serviceWith(new FakeChannel('email', 'error'), whatsapp).deliver('email', toEmail));

      expect(whatsapp.sent).toHaveLength(0);
    });

    it('keeps quota and error distinct', async () => {
      const quota = await failureOf(serviceWith(new FakeChannel('email', 'quota')).deliver('email', toEmail));
      const error = await failureOf(serviceWith(new FakeChannel('email', 'error')).deliver('email', toEmail));

      expect(quota.reason).toBe('quota');
      expect(error.reason).toBe('error');
    });
  });

  describe('phone channels', () => {
    it('prefers WhatsApp over SMS', () => {
      const service = serviceWith(
        new FakeChannel('email', 'ok'),
        new FakeChannel('whatsapp', 'ok'),
        new FakeChannel('sms', 'ok'),
      );

      expect(service.preferred('phone')).toBe('whatsapp');
      expect(service.available('phone')).toEqual(['whatsapp', 'sms']);
    });

    it('offers SMS to the same number when WhatsApp fails', async () => {
      const sms = new FakeChannel('sms', 'ok');
      const failure = await failureOf(
        serviceWith(new FakeChannel('email', 'ok'), new FakeChannel('whatsapp', 'error'), sms).deliver(
          'whatsapp',
          toPhone,
        ),
      );

      expect(failure.alternatives).toEqual(['sms']);
      expect(failure.otherRoutes).toEqual(['email']);
      // Offered, not done: each SMS is paid for, and the person chooses.
      expect(sms.sent).toHaveLength(0);
    });

    it('does not offer an unconfigured channel', async () => {
      const failure = await failureOf(
        serviceWith(new FakeChannel('email', 'ok'), new FakeChannel('whatsapp', 'error')).deliver(
          'whatsapp',
          toPhone,
        ),
      );

      expect(failure.alternatives).toEqual([]);
    });

    it('refuses to hand a phone number to the email channel', async () => {
      // A tampered `channel: "email"` on the mobile flow must not reach the mailer.
      await expect(serviceWith(new FakeChannel('email', 'ok')).deliver('email', toPhone)).rejects.toBeInstanceOf(
        VerificationChannelMismatchError,
      );
    });
  });
});

describe('what the person is told', () => {
  it('suggests the same-number channel first', () => {
    expect(
      messageFor({ reason: 'error', attempted: 'whatsapp', alternatives: ['sms'], otherRoutes: ['email'] }),
    ).toBe("We couldn't send your code on WhatsApp just now. You can have it sent by SMS instead.");
  });

  it('suggests the mobile route when email fails', () => {
    expect(
      messageFor({ reason: 'quota', attempted: 'email', alternatives: [], otherRoutes: ['phone'] }),
    ).toContain('continue with your mobile number');
  });

  it('never tells someone to retry soon when the allowance is gone', () => {
    const message = messageFor({ reason: 'quota', attempted: 'email', alternatives: [], otherRoutes: [] });

    expect(message).not.toContain('few minutes');
    expect(message).toContain('try again later');
  });

  it('names no provider', () => {
    const messages = [
      messageFor({ reason: 'quota', attempted: 'email', alternatives: [], otherRoutes: [] }),
      messageFor({ reason: 'quota', attempted: 'whatsapp', alternatives: [], otherRoutes: ['email'] }),
    ];

    for (const message of messages) expect(message).not.toMatch(/resend|meta|msg91/i);
  });
});
