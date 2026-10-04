import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { toAuthenticatedUser, type AuthenticatedUser } from './auth.service';

export interface Profile {
  name: string;
  /** The 10-digit form, ready to drop into a form field. */
  mobileNumber: string | null;
  preparingFor: string | null;
  currentStage: string | null;
  completed: boolean;
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
      preparingFor: user.preparingFor,
      currentStage: user.currentStage,
      completed: user.profileCompletedAt !== null,
    };
  }

  async update(
    userId: string,
    input: { name: string; mobileNumber: string; preparingFor: string; currentStage: string },
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name.trim(),
        // Stored with the country code, the same spelling a session
        // registration uses for its WhatsApp number.
        contactPhone: `91${input.mobileNumber}`,
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
