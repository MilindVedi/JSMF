import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { UserStatus, VerificationPurpose } from '@prisma/client';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  InvalidPhoneNumberError,
  maskPhoneNumber,
  normalisePhoneNumber,
} from '../../../shared/sms/domain/phone-number';
import type { VerificationChannelName } from '../domain/verification-channel.port';
import {
  AuthService,
  toAuthenticatedUser,
  type AuthenticatedUser,
  type RequestContext,
  type SessionTokens,
} from './auth.service';
import { VerificationCodeService } from './verification-code.service';
import {
  VerificationDeliveryService,
  VerificationUndeliverableError,
} from './verification-delivery.service';

/** Matches the expiry configured on the WhatsApp authentication template. */
const PHONE_CODE_TTL_MINUTES = 15;
/** Long enough to type a name; short enough that a leaked token is dead. */
const REGISTRATION_TTL_MINUTES = 15;
const DEFAULT_ROLE_KEY = 'STUDENT';

export interface PhoneCodeIssued {
  channel: VerificationChannelName;
  expiresInMinutes: number;
  /** `+********3210` — what the "we sent a code to…" screen shows. */
  destination: string;
  /** When the client may offer "resend", so its timer matches the server's. */
  resendAfterSeconds: number;
}

export type PhoneVerification =
  | { status: 'signed-in'; user: AuthenticatedUser; tokens: SessionTokens }
  | { status: 'registration-required'; registrationToken: string; expiresInMinutes: number };

/**
 * Signing in — and signing up — with a mobile number.
 *
 * **One flow for both, deliberately.** The person enters a number and gets a
 * code; only *after* the code comes back do we say whether an account exists.
 * Separate "sign in" and "sign up" screens would each have to answer "is this
 * number registered?" to whoever typed it, which turns the form into a lookup
 * tool for anyone with a list of numbers. Here the answer only ever reaches
 * someone who holds the phone.
 *
 * Passwordless: the code *is* the credential, every time. A password on a
 * phone account would be a second secret to leak and forget, protecting
 * nothing the code does not.
 *
 * Nothing here knows about WhatsApp or SMS — it asks
 * `VerificationDeliveryService` for "a phone channel", and a client that wants
 * a specific one (after WhatsApp did not arrive, say) passes it by name.
 */
@Injectable()
export class PhoneSignInService {
  private readonly logger = new Logger(PhoneSignInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: VerificationCodeService,
    private readonly delivery: VerificationDeliveryService,
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  /** Whether mobile sign-in is offered at all: switched on, and something can send. */
  enabled(): boolean {
    return this.config.get('PHONE_SIGNIN_ENABLED') && this.delivery.available('phone').length > 0;
  }

  // --- sign in / sign up ----------------------------------------------------

  /** Sends a code. Says nothing about whether the number has an account. */
  async start(
    input: { phone: string; channel?: VerificationChannelName },
    context: RequestContext,
  ): Promise<PhoneCodeIssued> {
    const phone = this.normalise(input.phone);

    return this.sendCode({
      purpose: VerificationPurpose.PHONE_SIGN_IN,
      subject: phone,
      phone,
      channel: input.channel,
      intent: 'sign-in',
      context,
    });
  }

  /**
   * Exchanges the code for a session — or, for a number with no account, for
   * a short-lived token that lets the person choose a name.
   *
   * The token exists so a new user is not sent a second code just to say what
   * they are called. It is single-use and bound to the number.
   */
  async verify(
    input: { phone: string; code: string },
    context: RequestContext,
  ): Promise<PhoneVerification> {
    const phone = this.normalise(input.phone);

    await this.codes.consume({
      purpose: VerificationPurpose.PHONE_SIGN_IN,
      subject: phone,
      code: input.code,
    });

    const existing = await this.prisma.user.findUnique({
      where: { phone },
      include: { roles: { include: { role: true } } },
    });

    if (existing) {
      return { status: 'signed-in', ...(await this.signIn(existing, context)) };
    }

    const registrationToken = await this.codes.issue({
      purpose: VerificationPurpose.PHONE_REGISTRATION,
      subject: phone,
      ttlMinutes: REGISTRATION_TTL_MINUTES,
      ip: context.ip ?? null,
      format: 'token',
      // Long and random, so guessing is not the threat; a small limit just
      // stops a leaked token being hammered.
      maxAttempts: 3,
    });

    return {
      status: 'registration-required',
      registrationToken,
      expiresInMinutes: REGISTRATION_TTL_MINUTES,
    };
  }

  /** Creates the account a verified number asked for. */
  async register(
    input: { phone: string; registrationToken: string; name: string },
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    const phone = this.normalise(input.phone);

    await this.codes.consume({
      purpose: VerificationPurpose.PHONE_REGISTRATION,
      subject: phone,
      code: input.registrationToken,
    });

    // Created in another tab since the code was verified. The person has
    // proved they hold this number either way, so the right answer is the
    // account that now exists rather than a confusing conflict.
    const raced = await this.prisma.user.findUnique({
      where: { phone },
      include: { roles: { include: { role: true } } },
    });
    if (raced) return this.signIn(raced, context);

    const user = await this.prisma.user.create({
      data: {
        phone,
        phoneVerifiedAt: new Date(),
        name: input.name.trim(),
        roles: { create: { role: { connect: { key: DEFAULT_ROLE_KEY } } } },
      },
      include: { roles: { include: { role: true } } },
    });

    this.logger.log(`Account created for ${maskPhoneNumber(phone)} by mobile sign-up`);

    const authenticated = toAuthenticatedUser(user);
    return { user: authenticated, tokens: await this.auth.startSessionFor(authenticated, context) };
  }

  // --- adding a number to an existing account ---------------------------------

  /**
   * Sends a code to a number the signed-in person wants on their account.
   *
   * This is what gives an email account a mobile way back in: once a verified
   * number is attached, "sign in with your mobile number" reaches *this*
   * account rather than creating a new, empty one.
   */
  async startLink(
    input: { userId: string; phone: string; channel?: VerificationChannelName },
    context: RequestContext,
  ): Promise<PhoneCodeIssued> {
    const phone = this.normalise(input.phone);

    return this.sendCode({
      purpose: VerificationPurpose.PHONE_LINK,
      // Bound to the user as well as the number, so two accounts trying the
      // same number cannot supersede or consume each other's codes.
      subject: linkSubject(input.userId, phone),
      phone,
      channel: input.channel,
      intent: 'phone-link',
      userId: input.userId,
      context,
    });
  }

  async completeLink(input: { userId: string; phone: string; code: string }): Promise<AuthenticatedUser> {
    const phone = this.normalise(input.phone);

    await this.codes.consume({
      purpose: VerificationPurpose.PHONE_LINK,
      subject: linkSubject(input.userId, phone),
      code: input.code,
    });

    // Checked only now, after the code came back: telling someone "that
    // number belongs to another account" before they prove they hold it
    // would be a lookup tool for any signed-in user.
    const owner = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (owner && owner.id !== input.userId) {
      throw new ConflictException(
        'This number already has its own JSMF account. Sign in with it to use that account.',
      );
    }

    const user = await this.prisma.user.update({
      where: { id: input.userId },
      data: { phone, phoneVerifiedAt: new Date() },
      include: { roles: { include: { role: true } } },
    });

    this.logger.log(`Verified mobile ${maskPhoneNumber(phone)} added to account ${user.id}`);

    return toAuthenticatedUser(user);
  }

  // --- internals --------------------------------------------------------------

  private async sendCode(input: {
    purpose: VerificationPurpose;
    subject: string;
    phone: string;
    channel?: VerificationChannelName;
    intent: 'sign-in' | 'phone-link';
    userId?: string;
    context: RequestContext;
  }): Promise<PhoneCodeIssued> {
    await this.enforceSendLimits(input.phone);

    const channel = input.channel ?? this.delivery.preferred('phone');
    if (!channel) {
      // Only reachable if every phone channel was switched off between the
      // client loading and submitting; answer in the same shape as a failed send.
      throw new VerificationUndeliverableError({
        reason: 'error',
        attempted: 'whatsapp',
        alternatives: [],
        otherRoutes: ['email'],
      });
    }

    const code = await this.codes.issue({
      purpose: input.purpose,
      subject: input.subject,
      ttlMinutes: PHONE_CODE_TTL_MINUTES,
      userId: input.userId ?? null,
      // No column for "sent to phone"; the subject is the number, and the
      // channel is recorded here for support ("it went by SMS, not WhatsApp").
      metadata: { channel },
      ip: input.context.ip ?? null,
      format: 'digits',
    });

    try {
      await this.delivery.deliver(channel, {
        intent: input.intent,
        code,
        destination: input.phone,
        addressKind: 'phone',
        expiresInMinutes: PHONE_CODE_TTL_MINUTES,
      });
    } catch (cause) {
      // A code that never left is retired and marked, so it neither lingers
      // as a valid secret nor counts against the cooldown — otherwise "send by
      // SMS instead" straight after a WhatsApp failure would be told to wait.
      await this.prisma.verificationCode.updateMany({
        where: { purpose: input.purpose, subject: input.subject, consumedAt: null },
        data: { consumedAt: new Date(), metadata: { channel, undelivered: true } },
      });
      throw cause;
    }

    return {
      channel,
      expiresInMinutes: PHONE_CODE_TTL_MINUTES,
      destination: maskPhoneNumber(input.phone),
      resendAfterSeconds: this.config.get('PHONE_CODE_RESEND_COOLDOWN_SECONDS'),
    };
  }

  /**
   * Per-number limits, on top of the per-IP throttle on the route.
   *
   * Every phone code is paid for, and the classic abuse — "SMS pumping" — is a
   * script requesting codes to many numbers from many IPs, where only a
   * per-number limit bites. Counted from `verification_codes` itself, so there
   * is no second store to keep in step (and no Redis to pay for in V1).
   */
  private async enforceSendLimits(phone: string): Promise<void> {
    const cooldownSeconds = this.config.get('PHONE_CODE_RESEND_COOLDOWN_SECONDS');
    const maxPerHour = this.config.get('PHONE_CODE_MAX_PER_HOUR');
    // The last hour's sends to this number, filtered in code rather than with
    // a JSON-path `NOT` in SQL: for the ordinary row, which has no
    // `undelivered` key, `NOT (undelivered = true)` is NULL rather than true,
    // and silently excludes every row the limit exists to count.
    const recent = (
      await this.prisma.verificationCode.findMany({
        where: {
          purpose: { in: [VerificationPurpose.PHONE_SIGN_IN, VerificationPurpose.PHONE_LINK] },
          subject: { endsWith: phone },
          createdAt: { gt: new Date(Date.now() - 60 * 60_000) },
        },
        orderBy: { createdAt: 'desc' },
        // No `take`: capping before the filter would let failed sends hide
        // delivered ones. An hour's rows for one number are a handful.
        select: { createdAt: true, metadata: true },
      })
    ).filter((row) => !(row.metadata as { undelivered?: boolean } | null)?.undelivered);

    const lastHour = recent.length;
    const latest = recent[0];

    if (lastHour >= maxPerHour) {
      throw tooManyRequests(
        'Too many codes have been sent to this number. Please try again in an hour.',
        60 * 60,
      );
    }

    if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      const wait = Math.ceil(cooldownSeconds - elapsed);
      if (wait > 0) {
        throw tooManyRequests(`Please wait ${wait} seconds before requesting another code.`, wait);
      }
    }
  }

  private async signIn(
    user: Parameters<typeof toAuthenticatedUser>[0] & { status: UserStatus; phoneVerifiedAt: Date | null },
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('This account is not available. Please contact support.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), phoneVerifiedAt: user.phoneVerifiedAt ?? new Date() },
    });

    const authenticated = toAuthenticatedUser(user);
    return { user: authenticated, tokens: await this.auth.startSessionFor(authenticated, context) };
  }

  private normalise(input: string): string {
    try {
      return normalisePhoneNumber(input, {
        defaultCountryCode: this.config.get('SMS_DEFAULT_COUNTRY_CODE'),
      });
    } catch (cause) {
      if (cause instanceof InvalidPhoneNumberError) throw new BadRequestException(cause.message);
      throw cause;
    }
  }
}

function linkSubject(userId: string, phone: string): string {
  return `${userId}:${phone}`;
}

function tooManyRequests(message: string, retryAfterSeconds: number): HttpException {
  return new HttpException(
    { statusCode: HttpStatus.TOO_MANY_REQUESTS, error: 'Too Many Requests', message, retryAfterSeconds },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
