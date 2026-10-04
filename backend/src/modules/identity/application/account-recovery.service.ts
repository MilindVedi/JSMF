import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { RefreshTokenRevokedReason, UserStatus, VerificationPurpose } from '@prisma/client';
import { activity } from '../../../shared/logging/activity';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { PasswordHasher } from '../domain/password-hasher.port';
import type { VerificationChannelName } from '../domain/verification-channel.port';
import {
  AuthService,
  toAuthenticatedUser,
  type AuthenticatedUser,
  type RequestContext,
  type SessionTokens,
} from './auth.service';
import { VerificationCodeService } from './verification-code.service';
import { VerificationDeliveryService } from './verification-delivery.service';

/** Long enough to find the message, short enough that a guessed code is dead. */
const SIGNUP_CODE_TTL_MINUTES = 15;
const RESET_CODE_TTL_MINUTES = 15;

/** The role every newly registered account receives. */
const DEFAULT_ROLE_KEY = 'STUDENT';

/**
 * What the caller is told when a code was issued successfully.
 *
 * `channel` is echoed back rather than assumed, so a client can say "we sent a
 * code to your email" or "…to your phone" from the response instead of
 * hardcoding the medium it guessed it was using.
 */
export interface CodeIssued {
  channel: VerificationChannelName;
  expiresInMinutes: number;
}

/**
 * Signing up with a verified address, and recovering an account whose password
 * is lost. Two flows, one shape: issue a code, deliver it, exchange it.
 *
 * They live together because they share every decision that matters — the code
 * primitive, the delivery abstraction, the rule that a failed send is answered
 * with alternatives rather than an error, and the fact that neither may create
 * or change anything until a code comes back. Splitting them would duplicate
 * that reasoning in two places and let the two drift.
 *
 * Nothing here knows how a code travels. `VerificationDeliveryService` decides
 * that, which is what leaves "let people use a mobile number instead" an
 * addition rather than a rewrite.
 */
@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly codes: VerificationCodeService,
    private readonly delivery: VerificationDeliveryService,
    private readonly auth: AuthService,
  ) {}

  // --- signup --------------------------------------------------------------

  /**
   * Step one: hold the details, send a code. **No account is created here.**
   *
   * The password is hashed now and parked in the code's metadata rather than
   * in a half-built user row. Two reasons. An address that never verifies
   * leaves nothing behind — no unverified accounts accumulating, no "email
   * already taken" from a row nobody ever proved they owned. And the plaintext
   * password is discarded at this point rather than travelling back through a
   * second request, so the buyer types it once.
   */
  async startSignup(
    input: { email: string; name?: string; password: string },
    context: RequestContext,
    channel: VerificationChannelName = 'email',
  ): Promise<CodeIssued> {
    const email = input.email.trim().toLowerCase();
    // The web signup asks for the name after the code, on the profile step.
    // Until then the account carries the address's local part — the same
    // fallback a Google sign-in without a display name gets.
    const name = (input.name?.trim() || email.split('@')[0]).slice(0, 120);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Explicit, consistent with `AuthService.register`: any signup form that
      // refuses duplicates already reveals this, and pretending otherwise only
      // makes a legitimate "you already have an account" impossible to explain.
      throw new ConflictException('An account with this email already exists');
    }

    const code = await this.codes.issue({
      purpose: VerificationPurpose.EMAIL_VERIFICATION,
      subject: email,
      ttlMinutes: SIGNUP_CODE_TTL_MINUTES,
      sentToEmail: email,
      metadata: { name, passwordHash: await this.hasher.hash(input.password) },
      ip: context.ip ?? null,
      format: 'digits',
    });

    // Throws VerificationUndeliverableError, which the controller turns into a
    // response carrying the alternatives. The code stays valid either way, so
    // a retry over another channel can deliver this same one.
    await this.delivery.deliver(channel, {
      intent: 'signup',
      code,
      destination: email,
      addressKind: 'email',
      // Only greet by name when one was actually given.
      name: input.name?.trim() || undefined,
      expiresInMinutes: SIGNUP_CODE_TTL_MINUTES,
    });

    return { channel, expiresInMinutes: SIGNUP_CODE_TTL_MINUTES };
  }

  /**
   * Step two: exchange the code for the account it describes.
   *
   * The duplicate check runs again, because `startSignup`'s check is separated
   * from this one by however long the buyer took to read their email — long
   * enough for the same address to be claimed by a Google sign-in, or by a
   * second signup in another tab.
   */
  async completeSignup(
    input: { email: string; code: string },
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    const email = input.email.trim().toLowerCase();

    const verified = await this.codes.consume({
      purpose: VerificationPurpose.EMAIL_VERIFICATION,
      subject: email,
      code: input.code,
    });

    const { name, passwordHash } = verified.metadata as { name?: string; passwordHash?: string };

    if (!name || !passwordHash) {
      // Only reachable if a code were issued by something that did not write
      // the metadata — a bug rather than a user error, and one that must not
      // silently produce an account with no password.
      this.logger.error(`EMAIL_VERIFICATION code for ${email} carried no signup details`);
      throw new ConflictException('That signup could not be completed. Please start again.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        // The code came back, which is the proof. This is the whole point of
        // the flow and the reason a password account is now as trustworthy an
        // address as a Google one.
        emailVerifiedAt: new Date(),
        roles: { create: { role: { connect: { key: DEFAULT_ROLE_KEY } } } },
      },
      include: { roles: { include: { role: true } } },
    });

    const authenticated: AuthenticatedUser = toAuthenticatedUser(user);

    activity(this.logger, 'auth.signup', { method: 'email', userId: user.id, email, ip: context.ip });

    return { user: authenticated, tokens: await this.auth.startSessionFor(authenticated, context) };
  }

  // --- password reset ------------------------------------------------------

  /**
   * Sends a reset code, if there is an account to reset.
   *
   * Answers identically whether or not the address has an account — the one
   * place this module is deliberately vague, and the reason is that the person
   * asking here is, by definition, not signed in. `register` can be explicit
   * about duplicates because someone typing a signup form already gets that
   * answer; a reset form would hand the same oracle to anyone with a list of
   * addresses and no other reason to be here.
   *
   * A delivery failure is still reported, which does narrow that slightly —
   * but an unhelpful silence when the buyer's mail genuinely cannot be sent is
   * worse than the leak, because it leaves someone locked out with no idea
   * why.
   */
  async startPasswordReset(
    input: { email: string },
    context: RequestContext,
    channel: VerificationChannelName = 'email',
  ): Promise<CodeIssued> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Nothing to reset, and nothing said about it. An OAuth-only account has
    // no password either, and is treated the same way: telling someone "that
    // account uses Google" would confirm the address exists.
    if (!user || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
      this.logger.log(`Password reset requested for ${email}, which has no resettable account`);
      return { channel, expiresInMinutes: RESET_CODE_TTL_MINUTES };
    }

    const code = await this.codes.issue({
      purpose: VerificationPurpose.PASSWORD_RESET,
      subject: email,
      ttlMinutes: RESET_CODE_TTL_MINUTES,
      sentToEmail: email,
      userId: user.id,
      ip: context.ip ?? null,
      format: 'digits',
    });

    await this.delivery.deliver(channel, {
      intent: 'password-reset',
      code,
      destination: email,
      addressKind: 'email',
      expiresInMinutes: RESET_CODE_TTL_MINUTES,
    });

    return { channel, expiresInMinutes: RESET_CODE_TTL_MINUTES };
  }

  /**
   * Checks the code without consuming it — so the UI can validate on the
   * "enter code" screen before showing password fields.
   */
  async verifyResetCode(input: { email: string; code: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    await this.codes.verify({
      purpose: VerificationPurpose.PASSWORD_RESET,
      subject: email,
      code: input.code,
    });
  }

  /**
   * Sets the new password and **signs every existing session out**.
   *
   * That last part is the security-relevant half. Someone resetting a password
   * may be doing it because another person has their account; leaving that
   * person's refresh tokens alive would make the reset cosmetic. Revoking the
   * lot costs a legitimate user one extra sign-in on their other devices,
   * which is a small price for the reset actually meaning something.
   */
  async completePasswordReset(
    input: { email: string; code: string; password: string },
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    const email = input.email.trim().toLowerCase();

    const verified = await this.codes.consume({
      purpose: VerificationPurpose.PASSWORD_RESET,
      subject: email,
      code: input.code,
    });

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ConflictException('That account is no longer available.');
    }

    const passwordHash = await this.hasher.hash(input.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          // Completing this proved the address as surely as signup does, so an
          // account created before verification existed becomes verified here.
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: RefreshTokenRevokedReason.PASSWORD_CHANGED },
      });
    });

    this.logger.warn(
      `Password reset completed for ${email} (verification ${verified.id}); all sessions revoked`,
    );

    const authenticated: AuthenticatedUser = toAuthenticatedUser(user);

    // Signed in immediately: the person just proved control of the address and
    // chose the password, so making them retype it would be ceremony.
    return { user: authenticated, tokens: await this.auth.startSessionFor(authenticated, context) };
  }
}
