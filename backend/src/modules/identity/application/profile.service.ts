import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { normaliseContactPhone } from '../../../shared/sms/domain/contact-phone';
import { toAuthenticatedUser, type AuthenticatedUser } from './auth.service';

export interface Profile {
  name: string;
  /**
   * The last ten digits — what pages from before the country picker expect.
   * Only meaningful for an Indian number; new pages read `mobileE164`.
   */
  mobileNumber: string | null;
  /** `+919876543210` — the whole number with its country code. */
  mobileE164: string | null;
  preparingFor: string | null;
  currentStage: string | null;
  completed: boolean;
  /** When the account was created, ISO. */
  memberSince: string;
}

/**
 * The few things asked once after signup — name, mobile number, exam and
 * stage — so the registration form can be prefilled rather than asked again.
 *
 * Only ever reads or writes the signed-in user's own row: the id comes from
 * the access token, never from the request body.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    return {
      name: user.name,
      mobileNumber: user.contactPhone ? user.contactPhone.slice(-10) : null,
      mobileE164: user.contactPhone ? `+${user.contactPhone}` : null,
      preparingFor: user.preparingFor,
      currentStage: user.currentStage,
      completed: user.profileCompletedAt !== null,
      memberSince: user.createdAt.toISOString(),
    };
  }

  /** Just the display name — for apps that let you edit it without the signup questions. */
  async rename(userId: string, name: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
      include: { roles: { include: { role: true } } },
    });

    activity(this.logger, 'auth.name_updated', { userId });

    return toAuthenticatedUser(user);
  }

  async update(
    userId: string,
    input: { name: string; mobileNumber: string; preparingFor: string; currentStage: string },
  ): Promise<AuthenticatedUser> {
    // Already validated by the DTO; normalised here to E.164 digits.
    const contactPhone = normaliseContactPhone(input.mobileNumber);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name.trim(),
        // Stored with the country code, the same spelling a session
        // registration uses for its WhatsApp number.
        contactPhone,
        preparingFor: input.preparingFor,
        currentStage: input.currentStage,
        profileCompletedAt: new Date(),
      },
      include: { roles: { include: { role: true } } },
    });

    activity(this.logger, 'auth.profile_updated', { userId });

    return toAuthenticatedUser(user);
  }
}
