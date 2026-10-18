import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { OAuthProvider } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Argon2PasswordHasher } from '../infrastructure/argon2-password-hasher';
import { AccountRecoveryService } from './account-recovery.service';
import { VerificationCodeService } from './verification-code.service';

/**
 * Email signup claiming an account nobody has signed in to yet — the accounts
 * backfill-session-buyers creates for seats bought outside checkout.
 *
 * Real code store and real Postgres; the delivery only records the code, and
 * session issuing is stubbed. Requires the dev stack. Everything created is
 * deleted by id at the end.
 */

const prisma = new PrismaService();
const hasher = new Argon2PasswordHasher();
const codes = new VerificationCodeService(prisma, hasher);
const sent: Array<{ destination: string; code: string; firstPassword?: boolean }> = [];
const delivery = {
  deliver: (_channel: string, request: { destination: string; code: string; firstPassword?: boolean }) => {
    sent.push(request);
    return Promise.resolve();
  },
} as never;
const auth = {
  startSessionFor: () =>
    Promise.resolve({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: '15m' }),
} as never;
const service = new AccountRecoveryService(prisma, hasher, codes, delivery, auth);

const context = { ip: '127.0.0.1' };
const userIds: string[] = [];
const emails: string[] = [];

async function account(data: { lastLoginAt?: Date; passwordHash?: string; google?: boolean } = {}) {
  const email = `claim-spec-${randomUUID()}@jsmf.test`;
  emails.push(email);
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Backfilled Buyer',
      lastLoginAt: data.lastLoginAt ?? null,
      passwordHash: data.passwordHash ?? null,
      ...(data.google
        ? {
            oauthAccounts: {
              create: { provider: OAuthProvider.GOOGLE, providerUserId: randomUUID(), email },
            },
          }
        : {}),
    },
  });
  userIds.push(user.id);
  return user;
}

const lastCode = (email: string) => {
  const found = [...sent].reverse().find((request) => request.destination === email);
  if (!found) throw new Error(`no code sent to ${email}`);
  return found.code;
};

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.verificationCode.deleteMany({ where: { subject: { in: emails } } });
  await prisma.oAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('email signup claiming a never-used account', () => {
  it('sets the password on the existing account, keeping its id and name', async () => {
    const user = await account();

    await service.startSignup({ email: user.email!, password: 'a-very-long-passphrase' }, context);
    const result = await service.completeSignup({ email: user.email!, code: lastCode(user.email!) }, context);

    expect(result.user.id).toBe(user.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.name).toBe('Backfilled Buyer');
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(await hasher.verify(after.passwordHash!, 'a-very-long-passphrase')).toBe(true);

    // Claimed once: a second signup is the ordinary duplicate.
    await expect(
      service.startSignup({ email: user.email!, password: 'another-long-passphrase' }, context),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an account that already has a Google login', async () => {
    const user = await account({ google: true });
    await expect(
      service.startSignup({ email: user.email!, password: 'a-very-long-passphrase' }, context),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an account someone has already signed in to', async () => {
    const user = await account({ lastLoginAt: new Date() });
    await expect(
      service.startSignup({ email: user.email!, password: 'a-very-long-passphrase' }, context),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an account that already has a password', async () => {
    const user = await account({ passwordHash: await hasher.hash('existing-long-passphrase') });
    await expect(
      service.startSignup({ email: user.email!, password: 'a-very-long-passphrase' }, context),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses at completion if the account was claimed another way in between', async () => {
    const user = await account();
    await service.startSignup({ email: user.email!, password: 'a-very-long-passphrase' }, context);

    // Signed in with Google while the code sat in the inbox.
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: OAuthProvider.GOOGLE, providerUserId: randomUUID(), email: user.email! },
    });

    await expect(
      service.completeSignup({ email: user.email!, code: lastCode(user.email!) }, context),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBeNull();
  });
});

describe('forgot password on an account that has never had a password', () => {
  it('lets a backfilled buyer set their first password on the same account', async () => {
    const user = await account();

    await service.startPasswordReset({ email: user.email! }, context);
    const code = lastCode(user.email!);
    expect(sent.at(-1)).toMatchObject({ firstPassword: true });

    const result = await service.completePasswordReset(
      { email: user.email!, code, password: 'a-very-long-passphrase' },
      context,
    );

    expect(result.user.id).toBe(user.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await hasher.verify(after.passwordHash!, 'a-very-long-passphrase')).toBe(true);
    expect(after.emailVerifiedAt).not.toBeNull();
  });

  it('lets a Google-only account add a password, keeping the Google login', async () => {
    const user = await account({ google: true });

    await service.startPasswordReset({ email: user.email! }, context);
    await service.completePasswordReset(
      { email: user.email!, code: lastCode(user.email!), password: 'a-very-long-passphrase' },
      context,
    );

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { oauthAccounts: true } });
    expect(after.passwordHash).not.toBeNull();
    expect(after.oauthAccounts).toHaveLength(1);
  });

  it('still words a normal reset as a reset', async () => {
    const user = await account({ passwordHash: await hasher.hash('existing-long-passphrase') });
    await service.startPasswordReset({ email: user.email! }, context);
    expect(sent.at(-1)).toMatchObject({ destination: user.email, firstPassword: false });
  });

  it('sends nothing for an unknown address, and answers the same', async () => {
    const before = sent.length;
    const answer = await service.startPasswordReset({ email: `nobody-${randomUUID()}@jsmf.test` }, context);
    expect(sent.length).toBe(before);
    expect(answer).toEqual({ channel: 'email', expiresInMinutes: 15 });
  });
});
