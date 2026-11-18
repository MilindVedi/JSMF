import { afterAll, describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { UpdateMobileDto } from '../http/dto/profile.dto';
import { ProfileService } from './profile.service';

/**
 * PATCH auth/me/mobile — the contact number on its own, as the PYQ website
 * and app edit it.
 *
 * Real Postgres; the avatar lookup is stubbed (no storage involved). Requires
 * the dev stack. Every account created is deleted by id at the end.
 */

const prisma = new PrismaService();
const avatars = { urlFor: () => Promise.resolve(null) } as never;
const profiles = new ProfileService(prisma, avatars);
const userIds: string[] = [];

async function account() {
  const user = await prisma.user.create({
    data: { email: `mobile-spec-${randomUUID()}@jsmf.test`, name: 'Mobile Spec' },
  });
  userIds.push(user.id);
  return user;
}

const errorsFor = (body: unknown) => validateSync(plainToInstance(UpdateMobileDto, body));

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('UpdateMobileDto', () => {
  it('accepts a 10-digit Indian mobile, E.164 for any country, and null', () => {
    expect(errorsFor({ mobileNumber: '9876543210' })).toHaveLength(0);
    expect(errorsFor({ mobileNumber: '+447911123456' })).toHaveLength(0);
    expect(errorsFor({ mobileNumber: null })).toHaveLength(0);
  });

  it('refuses a missing field, so a client bug cannot clear the number by omission', () => {
    expect(errorsFor({})).not.toHaveLength(0);
  });

  it('refuses numbers that cannot be dialled', () => {
    expect(errorsFor({ mobileNumber: '12345' })).not.toHaveLength(0);
    expect(errorsFor({ mobileNumber: '+91123' })).not.toHaveLength(0);
    expect(errorsFor({ mobileNumber: 9876543210 })).not.toHaveLength(0);
  });
});

describe('ProfileService.setMobile', () => {
  it('stores the number with its country code and returns it', async () => {
    const user = await account();
    const profile = await profiles.setMobile(user.id, '9876543210');
    expect(profile.mobileE164).toBe('+919876543210');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.contactPhone).toBe('919876543210');
  });

  it('keeps another country as typed, in E.164', async () => {
    const user = await account();
    const profile = await profiles.setMobile(user.id, '+447911123456');
    expect(profile.mobileE164).toBe('+447911123456');
  });

  it('removes the number on null', async () => {
    const user = await account();
    await profiles.setMobile(user.id, '9876543210');
    const profile = await profiles.setMobile(user.id, null);
    expect(profile.mobileE164).toBeNull();
  });

  it('never touches the verified sign-in number or marks the signup questions answered', async () => {
    const user = await account();
    await profiles.setMobile(user.id, '9876543210');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.phone).toBeNull();
    expect(row.phoneVerifiedAt).toBeNull();
    expect(row.profileCompletedAt).toBeNull();
  });
});
