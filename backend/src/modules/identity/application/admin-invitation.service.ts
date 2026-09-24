import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { VerificationPurpose } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { MailProvider } from '../../../shared/mail/domain/mail-provider.port';
import { adminInvitation } from '../../../shared/mail/templates/mail-templates';
import { PasswordHasher } from '../domain/password-hasher.port';
import {
  AuthService,
  type AuthenticatedUser,
  type RequestContext,
  type SessionTokens,
} from './auth.service';
import { VerificationCodeService } from './verification-code.service';

const INVITATION_TTL_HOURS = 48;

/**
 * Admin accounts are created by invitation from an existing admin.
 *
 * There is deliberately **no public way to ask for admin access**. An earlier
 * design let anyone request one and emailed a code to the owner to approve;
 * that turned an unauthenticated endpoint into a way to flood the owner's inbox
 * and required hand-relaying a credential over chat. Making it an authenticated
 * action by someone who already has the privilege is both the stronger control
 * and the one every comparable system uses.
 *
 * The invite link goes **to the invitee**, so nothing is relayed by hand, and
 * `prisma/seed.ts` still creates a bootstrap admin when none exists — that
 * account is where the first invitation comes from.
 */
@Injectable()
export class AdminInvitationService {
  private readonly logger = new Logger(AdminInvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: VerificationCodeService,
    private readonly mail: MailProvider,
    private readonly config: AppConfig,
    private readonly hasher: PasswordHasher,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /** Invites an address to become an admin, and emails them the link. */
  async invite(
    input: { email: string; name: string },
    invitedBy: AuthenticatedUser,
    context: RequestContext,
  ): Promise<{ email: string; expiresInHours: number }> {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();

    const existing = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    // Unlike the public endpoint this replaced, being explicit is fine here:
    // the caller is already an authenticated admin, so there is no enumeration
    // risk in telling them the person is already an admin.
    if (existing?.roles.some((assignment) => assignment.role.key === 'ADMIN')) {
      throw new ConflictException(`${email} is already an admin.`);
    }

    const secret = await this.codes.issue({
      purpose: VerificationPurpose.ADMIN_INVITATION,
      subject: email,
      ttlMinutes: INVITATION_TTL_HOURS * 60,
      sentToEmail: email,
      metadata: { name, invitedByUserId: invitedBy.id, invitedByName: invitedBy.name },
      ip: context.ip ?? null,
      format: 'token',
      // Unguessable by construction, so attempt-limiting would only give an
      // attacker a way to burn a legitimate invitation.
      maxAttempts: 50,
    });

    const token = encodeToken(email, secret);
    const link = `${this.config.get('ADMIN_APP_URL').replace(/\/$/, '')}/admin/accept-invite?token=${encodeURIComponent(token)}`;

    const rendered = adminInvitation({
      inviteeName: name,
      invitedByName: invitedBy.name,
      link,
      expiresInHours: INVITATION_TTL_HOURS,
    });

    await this.mail.send({
      to: { email, name },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag: 'admin-invitation',
    });

    await this.audit.record({
      actorUserId: invitedBy.id,
      action: 'admin.invited',
      entityType: 'user',
      after: { email, name },
      ip: context.ip ?? null,
    });

    this.logger.log(`${invitedBy.email} invited ${email} to become an admin`);

    return { email, expiresInHours: INVITATION_TTL_HOURS };
  }

  /** Validates an invitation without consuming it, so the accept page can render. */
  async peek(token: string): Promise<{ email: string; name: string; invitedByName: string }> {
    const { email } = decodeToken(token);

    const record = await this.prisma.verificationCode.findFirst({
      where: {
        purpose: VerificationPurpose.ADMIN_INVITATION,
        subject: email,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('That invitation is invalid or has expired.');
    }

    const metadata = record.metadata as Record<string, unknown> | null;

    return {
      email: record.subject,
      name: readString(metadata, 'name', 'JSMF Admin'),
      invitedByName: readString(metadata, 'invitedByName', 'a JSMF admin'),
    };
  }

  /** Accepts an invitation by setting a password. */
  async acceptWithPassword(
    input: { token: string; password: string },
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    const invitation = await this.consume(input.token);

    const user = await this.createAdmin({
      email: invitation.email,
      name: invitation.name,
      passwordHash: await this.hasher.hash(input.password),
    });

    return { user, tokens: await this.auth.startSessionFor(user, context) };
  }

  /**
   * Verifies and consumes an invitation.
   *
   * The token carries its own subject (`base64url(email).secret`), so this is
   * one indexed lookup plus one hash check. Trusting the email half only
   * selects which row to verify against — the secret half still has to match
   * that row, so naming someone else's address gains nothing.
   */
  async consume(token: string): Promise<{ email: string; name: string }> {
    const { email, secret } = decodeToken(token);

    const verified = await this.codes.consume({
      purpose: VerificationPurpose.ADMIN_INVITATION,
      subject: email,
      code: secret,
    });

    const metadata = verified.metadata as Record<string, unknown> | null;
    return { email: verified.subject, name: readString(metadata, 'name', 'JSMF Admin') };
  }

  async listAdmins(): Promise<
    { id: string; email: string; name: string; createdAt: Date; lastLoginAt: Date | null }[]
  > {
    const admins = await this.prisma.user.findMany({
      where: { roles: { some: { role: { key: 'ADMIN' } } } },
      select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return admins;
  }

  async listPendingInvitations(): Promise<
    { id: string; email: string; name: string; invitedByName: string; expiresAt: Date }[]
  > {
    const pending = await this.prisma.verificationCode.findMany({
      where: {
        purpose: VerificationPurpose.ADMIN_INVITATION,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return pending.map((record) => {
      const metadata = record.metadata as Record<string, unknown> | null;
      return {
        id: record.id,
        email: record.subject,
        name: readString(metadata, 'name', ''),
        invitedByName: readString(metadata, 'invitedByName', ''),
        expiresAt: record.expiresAt,
      };
    });
  }

  /** Revokes a pending invitation — consuming it is what makes it unusable. */
  async revokeInvitation(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const revoked = await this.prisma.verificationCode.updateMany({
      where: { id, purpose: VerificationPurpose.ADMIN_INVITATION, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (revoked.count !== 1) {
      throw new BadRequestException('That invitation no longer exists.');
    }

    await this.audit.record({
      actorUserId: actor.id,
      action: 'admin.invitation_revoked',
      entityType: 'verification_code',
      entityId: id,
      ip: context.ip ?? null,
    });
  }

  /**
   * Creates the account and attaches ADMIN.
   *
   * An existing account is upgraded rather than rejected: the invitation was
   * addressed to this person deliberately, and refusing because they already
   * buy PDFs on the storefront would be an odd thing to explain.
   */
  async createAdmin(input: {
    email: string;
    name: string;
    passwordHash?: string | null;
  }): Promise<AuthenticatedUser> {
    const user = await this.prisma.$transaction(async (tx) => {
      const adminRole = await tx.role.findUnique({ where: { key: 'ADMIN' } });
      if (!adminRole) {
        throw new ConflictException('The ADMIN role is missing. Run the database seed.');
      }

      const existing = await tx.user.findUnique({ where: { email: input.email } });

      const account = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              // Never overwrite a password the person already set — being made
              // an admin is not authorisation to reset their credentials.
              passwordHash: existing.passwordHash ?? input.passwordHash ?? null,
            },
          })
        : await tx.user.create({
            data: {
              email: input.email,
              name: input.name,
              passwordHash: input.passwordHash ?? null,
              emailVerifiedAt: new Date(),
              roles: { create: { role: { connect: { key: 'STUDENT' } } } },
            },
          });

      await tx.userRole.upsert({
        where: { userId_roleId: { userId: account.id, roleId: adminRole.id } },
        create: { userId: account.id, roleId: adminRole.id },
        update: {},
      });

      return tx.user.findUniqueOrThrow({
        where: { id: account.id },
        include: { roles: { include: { role: true } } },
      });
    });

    this.logger.warn(`ADMIN role granted to ${user.email} via invitation`);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((assignment) => assignment.role.key),
    };
  }
}

/**
 * `base64url(email).secret` — the token names the row to check, the secret
 * proves entitlement to it. Without the subject half, verifying would mean
 * hashing the token against every outstanding invitation.
 */
function encodeToken(email: string, secret: string): string {
  return `${Buffer.from(email, 'utf8').toString('base64url')}.${secret}`;
}

function decodeToken(token: string): { email: string; secret: string } {
  const separator = token.indexOf('.');
  if (separator <= 0) {
    throw new BadRequestException('That invitation is invalid or has expired.');
  }

  const email = Buffer.from(token.slice(0, separator), 'base64url').toString('utf8');
  const secret = token.slice(separator + 1);

  if (!email.includes('@') || !secret) {
    throw new BadRequestException('That invitation is invalid or has expired.');
  }

  return { email, secret };
}

function readString(
  metadata: Record<string, unknown> | null,
  key: string,
  fallback: string,
): string {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
