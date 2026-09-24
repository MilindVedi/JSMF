import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuthProvider, UserStatus, VerificationPurpose } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { GoogleOAuthClient, type GoogleIdentity } from '../infrastructure/google-oauth.client';
import { AdminInvitationService } from './admin-invitation.service';
import {
  AuthService,
  type AuthenticatedUser,
  type RequestContext,
  type SessionTokens,
} from './auth.service';
import { VerificationCodeService } from './verification-code.service';

/** The handoff code is exchanged immediately by the page Google returns to. */
const HANDOFF_TTL_MINUTES = 2;

export type OAuthIntent = 'user' | 'admin';

interface OAuthState {
  /** Where the finished session is delivered. Always allowlist-checked. */
  redirect: string;
  intent: OAuthIntent;
  /** An admin invitation token, when `intent` is `admin`. */
  invitation?: string;
  nonce: string;
}

/**
 * Google sign-in, for every JSMF application.
 *
 * This lives in the identity module and knows nothing about the PDF platform:
 * the PYQ app, the storefront and the mobile apps all use this same flow. The
 * only per-application input is the redirect target, and that is chosen from a
 * configured allowlist rather than accepted from the caller — an unvalidated
 * redirect would let anyone have a real session delivered to a site they own,
 * which is the classic OAuth open-redirect.
 *
 * Sessions come back through a short-lived single-use handoff code rather than
 * tokens in the redirect URL. URLs end up in browser history, `Referer`
 * headers, and server logs; a refresh token that leaks into any of those is a
 * durable account compromise.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleOAuthClient,
    private readonly auth: AuthService,
    private readonly codes: VerificationCodeService,
    private readonly invitations: AdminInvitationService,
    private readonly config: AppConfig,
  ) {}

  /** Step 1 — where to send the browser. */
  async startGoogle(input: {
    redirect?: string;
    intent?: OAuthIntent;
    invitation?: string;
  }): Promise<string> {
    if (!this.google.isEnabled) {
      throw new BadRequestException('Google sign-in is not enabled.');
    }

    const redirect = this.resolveRedirect(input.redirect);
    const intent: OAuthIntent = input.intent === 'admin' ? 'admin' : 'user';

    if (intent === 'admin') {
      if (!input.invitation) {
        throw new BadRequestException('Becoming an admin requires an invitation.');
      }
      // Fail before leaving for Google rather than after, so someone with an
      // expired invitation is not sent through a whole consent screen first.
      await this.invitations.peek(input.invitation);
    }

    const state = this.signState({
      redirect,
      intent,
      invitation: input.invitation,
      nonce: randomBytes(16).toString('base64url'),
    });

    return this.google.buildConsentUrl(state);
  }

  /**
   * Step 2 — Google returned. Produces the URL to redirect the browser to,
   * carrying only a single-use handoff code.
   */
  async completeGoogle(
    input: { code: string; state: string },
    context: RequestContext,
  ): Promise<string> {
    const state = this.verifyState(input.state);
    const identity = await this.google.exchangeCode(input.code);

    const user =
      state.intent === 'admin'
        ? await this.resolveAdmin(identity, state.invitation)
        : await this.resolveUser(identity);

    const handoff = await this.codes.issue({
      purpose: VerificationPurpose.OAUTH_HANDOFF,
      subject: user.id,
      userId: user.id,
      ttlMinutes: HANDOFF_TTL_MINUTES,
      format: 'token',
      ip: context.ip ?? null,
    });

    const url = new URL(state.redirect);
    url.searchParams.set('code', `${user.id}.${handoff}`);
    return url.toString();
  }

  /**
   * Step 3 — the front-end exchanges the handoff code for real tokens over
   * POST, so they never appear in a URL.
   */
  async exchangeHandoff(
    handoffCode: string,
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    const separator = handoffCode.indexOf('.');
    if (separator <= 0) {
      throw new UnauthorizedException('That sign-in link is invalid or has expired.');
    }

    const userId = handoffCode.slice(0, separator);
    const secret = handoffCode.slice(separator + 1);

    try {
      await this.codes.consume({
        purpose: VerificationPurpose.OAUTH_HANDOFF,
        subject: userId,
        code: secret,
      });
    } catch {
      throw new UnauthorizedException('That sign-in link is invalid or has expired.');
    }

    const user = await this.auth.findAuthenticatedUser(userId);
    if (!user) {
      throw new UnauthorizedException('That sign-in link is invalid or has expired.');
    }

    return { user, tokens: await this.auth.startSessionFor(user, context) };
  }

  /**
   * Where to send the browser when the callback fails.
   *
   * The state is verified first: only a signature we produced can choose a
   * destination, so a forged or absent state gets `null` and the caller shows a
   * plain error instead of redirecting anywhere. Skipping that check would make
   * the failure path itself an open redirect — the error case being the one
   * people forget to protect is exactly why it is handled here.
   */
  failureRedirect(rawState: string | undefined, reason: string): string | null {
    if (!rawState) return null;

    try {
      const state = this.verifyState(rawState);
      const url = new URL(state.redirect);
      url.searchParams.set('error', reason);
      return url.toString();
    } catch {
      return null;
    }
  }

  /**
   * Finds or creates the JSMF account behind a Google identity.
   *
   * Matching an existing account by email is only done when Google says the
   * address is verified. Without that check, someone could create a Google
   * account asserting a JSMF user's email and be handed their account.
   */
  private async resolveUser(identity: GoogleIdentity): Promise<AuthenticatedUser> {
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: OAuthProvider.GOOGLE,
          providerUserId: identity.providerUserId,
        },
      },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });

    if (linked) {
      if (linked.user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('This account is not active');
      }

      await this.prisma.oAuthAccount.update({
        where: { id: linked.id },
        data: { lastLoginAt: new Date() },
      });
      await this.prisma.user.update({
        where: { id: linked.userId },
        data: { lastLoginAt: new Date() },
      });

      return toAuthenticated(linked.user);
    }

    const existing = identity.emailVerified
      ? await this.prisma.user.findUnique({
          where: { email: identity.email },
          include: { roles: { include: { role: true } } },
        })
      : null;

    if (existing) {
      if (existing.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('This account is not active');
      }

      // Linking, not creating: the person already has an account with a
      // password and is now also signing in with Google. Two accounts for one
      // human is the failure mode this avoids.
      await this.prisma.oAuthAccount.create({
        data: {
          userId: existing.id,
          provider: OAuthProvider.GOOGLE,
          providerUserId: identity.providerUserId,
          email: identity.email,
          lastLoginAt: new Date(),
        },
      });

      this.logger.log(`Linked Google identity to existing account ${existing.email}`);
      return toAuthenticated(existing);
    }

    const created = await this.prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        // No password: this account is reachable only through Google until the
        // person sets one. `users.password_hash` is nullable for exactly this.
        passwordHash: null,
        emailVerifiedAt: identity.emailVerified ? new Date() : null,
        lastLoginAt: new Date(),
        roles: { create: { role: { connect: { key: 'STUDENT' } } } },
        oauthAccounts: {
          create: {
            provider: OAuthProvider.GOOGLE,
            providerUserId: identity.providerUserId,
            email: identity.email,
            lastLoginAt: new Date(),
          },
        },
      },
      include: { roles: { include: { role: true } } },
    });

    this.logger.log(`Created account ${created.email} from Google sign-in`);
    return toAuthenticated(created);
  }

  /** Accepting an admin invitation with Google: the invitation must match the Google email. */
  private async resolveAdmin(
    identity: GoogleIdentity,
    invitationToken: string | undefined,
  ): Promise<AuthenticatedUser> {
    if (!invitationToken) {
      throw new BadRequestException('Becoming an admin requires an invitation.');
    }

    if (!identity.emailVerified) {
      throw new BadRequestException(
        'Google has not verified that email address, so it cannot be used for an admin account.',
      );
    }

    const invitation = await this.invitations.consume(invitationToken);

    // The invitation was addressed to one specific person. Signing in with a
    // different Google account must not inherit it.
    if (invitation.email !== identity.email) {
      this.logger.warn(
        `Admin invitation for ${invitation.email} was presented with Google account ${identity.email}`,
      );
      throw new BadRequestException(
        `That invitation was sent to ${invitation.email}, but you signed in to Google as ${identity.email}.`,
      );
    }

    const user = await this.invitations.createAdmin({
      email: identity.email,
      name: identity.name,
    });

    await this.prisma.oAuthAccount.upsert({
      where: {
        provider_providerUserId: {
          provider: OAuthProvider.GOOGLE,
          providerUserId: identity.providerUserId,
        },
      },
      create: {
        userId: user.id,
        provider: OAuthProvider.GOOGLE,
        providerUserId: identity.providerUserId,
        email: identity.email,
        lastLoginAt: new Date(),
      },
      update: { lastLoginAt: new Date() },
    });

    return user;
  }

  /**
   * The redirect target must be one of the configured front-ends.
   *
   * Identity is platform-wide, so this is a list rather than one value — but it
   * is a list, not a free parameter, because an attacker who can choose where
   * a completed session is delivered has bypassed authentication entirely.
   */
  private resolveRedirect(requested?: string): string {
    const allowed = this.config.get('OAUTH_ALLOWED_REDIRECTS');

    if (!requested) return allowed[0];

    // Exact match against the allowlist. Prefix or hostname matching is how
    // open-redirect bugs are usually introduced — `https://trusted.com.evil.io`
    // passes a naive `startsWith` check.
    if (!allowed.includes(requested)) {
      this.logger.warn(`Rejected OAuth redirect to non-allowlisted target: ${requested}`);
      throw new BadRequestException('That sign-in redirect target is not allowed.');
    }

    return requested;
  }

  /**
   * `state` is signed, not stored.
   *
   * It has to survive a round trip through Google and come back unmodified;
   * signing it with the server's secret means a tampered state — a swapped
   * redirect, an injected admin grant — fails verification without needing a
   * table or a session to check it against.
   */
  private signState(state: OAuthState): string {
    const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
    return `${payload}.${this.stateSignature(payload)}`;
  }

  private verifyState(raw: string): OAuthState {
    const separator = raw.lastIndexOf('.');
    if (separator <= 0) {
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    const payload = raw.slice(0, separator);
    const presented = Buffer.from(raw.slice(separator + 1), 'utf8');
    const expected = Buffer.from(this.stateSignature(payload), 'utf8');

    if (
      presented.length !== expected.length ||
      !timingSafeEqual(presented, expected)
    ) {
      this.logger.warn('Rejected an OAuth callback with a tampered state parameter');
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    const state = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as OAuthState;

    // Re-checked on the way back too: the allowlist may have changed while the
    // user was at Google, and this is the value actually used for the redirect.
    state.redirect = this.resolveRedirect(state.redirect);
    return state;
  }

  private stateSignature(payload: string): string {
    return createHmac('sha256', this.config.get('OAUTH_STATE_SECRET'))
      .update(payload)
      .digest('base64url');
  }
}

function toAuthenticated(user: {
  id: string;
  email: string;
  name: string;
  roles: { role: { key: string } }[];
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles.map((assignment) => assignment.role.key),
  };
}
