import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SmsService } from '../../../shared/sms/application/sms.service';
import type { SendSmsRequest } from '../../../shared/sms/domain/sms-provider.port';
import { WhatsAppService } from '../../../shared/whatsapp/application/whatsapp.service';
import {
  WhatsAppDeliveryError,
  type SendWhatsAppRequest,
} from '../../../shared/whatsapp/domain/whatsapp-provider.port';
import { Argon2PasswordHasher } from '../infrastructure/argon2-password-hasher';
import { EmailVerificationChannel } from '../infrastructure/email-verification.channel';
import { SmsVerificationChannel } from '../infrastructure/sms-verification.channel';
import { WhatsAppVerificationChannel } from '../infrastructure/whatsapp-verification.channel';
import { PhoneSignInService } from './phone-sign-in.service';
import { VerificationCodeService } from './verification-code.service';
import {
  VerificationChannelMismatchError,
  VerificationDeliveryService,
  VerificationUndeliverableError,
} from './verification-delivery.service';

/**
 * Mobile sign-in against a real Postgres.
 *
 * Real where it matters: the code store (hashing, supersession, attempts), the
 * unique phone constraint, the rate limits counted from `verification_codes`,
 * and the real WhatsApp and SMS channels and services. Only the vendor calls
 * are captured, and session issuing is stubbed — tokens are covered by the
 * auth tests and would only add key setup here.
 *
 * Requires the dev stack (`docker compose up`). Everything created is deleted
 * by id or by this run's numbers at the end.
 */

const settings: Record<string, unknown> = {};
const config = {
  get: (key: string) => settings[key],
} as never;

function resetSettings() {
  Object.assign(settings, {
    PHONE_SIGNIN_ENABLED: true,
    WHATSAPP_DRIVER: 'log',
    SMS_DRIVER: 'log',
    SMS_DEFAULT_COUNTRY_CODE: '91',
    PHONE_CODE_RESEND_COOLDOWN_SECONDS: 60,
    PHONE_CODE_MAX_PER_HOUR: 5,
  });
}

/** What each vendor would have been sent — the codes are read from here. */
const whatsappSent: SendWhatsAppRequest[] = [];
const smsSent: SendSmsRequest[] = [];
let whatsappFails = false;

const whatsappProvider = {
  name: 'log' as const,
  send(request: SendWhatsAppRequest) {
    if (whatsappFails) return Promise.reject(new WhatsAppDeliveryError('refused', 'log'));
    whatsappSent.push(request);
    return Promise.resolve({ messageId: 'wamid.test', provider: 'log' as const });
  },
};
const smsProvider = {
  name: 'log' as const,
  send(request: SendSmsRequest) {
    smsSent.push(request);
    return Promise.resolve({ messageId: 'sms.test', provider: 'log' as const });
  },
};

const prisma = new PrismaService();
const codes = new VerificationCodeService(prisma, new Argon2PasswordHasher());
const delivery = new VerificationDeliveryService(
  new EmailVerificationChannel({} as never),
  new WhatsAppVerificationChannel(new WhatsAppService(whatsappProvider as never, config), config),
  new SmsVerificationChannel(new SmsService(smsProvider as never, config), config),
);
const auth = {
  startSessionFor: () =>
    Promise.resolve({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: '15m' }),
} as never;
const service = new PhoneSignInService(prisma, codes, delivery, auth, config);

const context = { ip: '127.0.0.1' };
const numbers: string[] = [];
const userIds: string[] = [];

/** A fresh, valid Indian mobile per test, so runs never collide. */
function freshNumber(): string {
  const national = `9${randomInt(100_000_000, 999_999_999)}`;
  numbers.push(`91${national}`);
  return national;
}

const lastWhatsAppCode = () => {
  const message = whatsappSent.at(-1)?.message;
  if (message?.kind !== 'authentication-code') throw new Error('no code was sent on WhatsApp');
  return message.code;
};

async function status(promise: Promise<unknown>): Promise<number> {
  const error = await promise.catch((cause: unknown) => cause);
  return error instanceof HttpException ? error.getStatus() : -1;
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(() => {
  resetSettings();
  whatsappFails = false;
  whatsappSent.length = 0;
  smsSent.length = 0;
});

afterAll(async () => {
  await prisma.verificationCode.deleteMany({
    where: { OR: numbers.map((number) => ({ subject: { endsWith: number } })) },
  });
  await prisma.user.deleteMany({
    where: { OR: [{ id: { in: userIds } }, { phone: { in: numbers } }] },
  });
  await prisma.$disconnect();
});

describe('mobile sign-up and sign-in', () => {
  it('creates an account for a new number, with no email', async () => {
    const phone = freshNumber();

    const issued = await service.start({ phone }, context);
    expect(issued.channel).toBe('whatsapp');
    expect(issued.destination).toMatch(/^\+\*+\d{4}$/);

    const verified = await service.verify({ phone, code: lastWhatsAppCode() }, context);
    expect(verified.status).toBe('registration-required');
    if (verified.status !== 'registration-required') return;

    const { user } = await service.register(
      { phone, registrationToken: verified.registrationToken, name: 'Mobile Buyer' },
      context,
    );
    userIds.push(user.id);

    expect(user).toMatchObject({ email: null, phone: `91${phone}`, roles: ['STUDENT'] });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.phoneVerifiedAt).not.toBeNull();
  });

  it('signs a returning number into the same account, however it is typed', async () => {
    const phone = freshNumber();
    await service.start({ phone }, context);
    const first = await service.verify({ phone, code: lastWhatsAppCode() }, context);
    if (first.status !== 'registration-required') throw new Error('expected a new number');
    const { user } = await service.register(
      { phone, registrationToken: first.registrationToken, name: 'Returning' },
      context,
    );
    userIds.push(user.id);

    // Typed differently the second time — the same person, the same account.
    settings.PHONE_CODE_RESEND_COOLDOWN_SECONDS = 0;
    await service.start({ phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` }, context);
    const second = await service.verify({ phone: `0${phone}`, code: lastWhatsAppCode() }, context);

    expect(second.status).toBe('signed-in');
    if (second.status === 'signed-in') expect(second.user.id).toBe(user.id);
  });

  it('rejects a wrong code without revealing whether the number has an account', async () => {
    const phone = freshNumber();
    await service.start({ phone }, context);

    expect(await status(service.verify({ phone, code: '000000' }, context))).toBe(400);
  });

  it('accepts a registration token once', async () => {
    const phone = freshNumber();
    await service.start({ phone }, context);
    const verified = await service.verify({ phone, code: lastWhatsAppCode() }, context);
    if (verified.status !== 'registration-required') throw new Error('expected a new number');

    const { user } = await service.register(
      { phone, registrationToken: verified.registrationToken, name: 'Once' },
      context,
    );
    userIds.push(user.id);

    expect(
      await status(
        service.register({ phone, registrationToken: verified.registrationToken, name: 'Twice' }, context),
      ),
    ).toBe(400);
  });
});

describe('cost controls', () => {
  it('refuses a resend inside the cooldown', async () => {
    const phone = freshNumber();
    await service.start({ phone }, context);

    expect(await status(service.start({ phone }, context))).toBe(429);
    expect(whatsappSent).toHaveLength(1);
  });

  it('caps sends per number per hour', async () => {
    const phone = freshNumber();
    settings.PHONE_CODE_RESEND_COOLDOWN_SECONDS = 0;
    settings.PHONE_CODE_MAX_PER_HOUR = 2;

    await service.start({ phone }, context);
    await service.start({ phone }, context);

    expect(await status(service.start({ phone }, context))).toBe(429);
  });

  it('lets SMS be tried straight after WhatsApp fails', async () => {
    // A code that never left must not trigger the cooldown — otherwise the
    // "send by SMS instead" button would answer "please wait 60 seconds".
    const phone = freshNumber();
    whatsappFails = true;

    const error = await service.start({ phone }, context).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(VerificationUndeliverableError);
    expect((error as VerificationUndeliverableError).failure.alternatives).toEqual(['sms']);

    const issued = await service.start({ phone, channel: 'sms' }, context);
    expect(issued.channel).toBe('sms');

    // And the SMS code is the one that works.
    const code = smsSent.at(-1)?.variables.OTP;
    expect((await service.verify({ phone, code: code! }, context)).status).toBe('registration-required');
  });

  it('refuses to send a phone code by email', async () => {
    const phone = freshNumber();
    await expect(service.start({ phone, channel: 'email' }, context)).rejects.toBeInstanceOf(
      VerificationChannelMismatchError,
    );
  });
});

describe('adding a number to an existing account', () => {
  it('attaches a verified number to an email account', async () => {
    const account = await prisma.user.create({
      data: { email: `link-${randomUUID()}@jsmf.test`, name: 'Email Account' },
    });
    userIds.push(account.id);
    const phone = freshNumber();

    await service.startLink({ userId: account.id, phone }, context);
    const updated = await service.completeLink({ userId: account.id, phone, code: lastWhatsAppCode() });

    expect(updated.phone).toBe(`91${phone}`);
    expect(updated.email).toBe(account.email);
  });

  it('refuses a number that already has its own account — only after the code', async () => {
    const phone = freshNumber();
    const owner = await prisma.user.create({ data: { phone: `91${phone}`, name: 'Owner' } });
    const other = await prisma.user.create({
      data: { email: `other-${randomUUID()}@jsmf.test`, name: 'Other' },
    });
    userIds.push(owner.id, other.id);

    // The code is still sent: refusing up front would tell any signed-in user
    // which numbers are registered.
    await service.startLink({ userId: other.id, phone }, context);
    expect(
      await status(service.completeLink({ userId: other.id, phone, code: lastWhatsAppCode() })),
    ).toBe(409);
  });
});

describe('switched off', () => {
  it('reports itself unavailable, and offers no phone channel', () => {
    settings.PHONE_SIGNIN_ENABLED = false;

    expect(service.enabled()).toBe(false);
    expect(delivery.available('phone')).toEqual([]);
  });
});
