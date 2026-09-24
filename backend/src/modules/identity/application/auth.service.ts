import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RefreshTokenRevokedReason, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AppConfig } from '../../../config/config.module';
import { PasswordHasher } from '../domain/password-hasher.port';
import { TokenService } from './token.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

/** The role every newly registered account receives. */
const DEFAULT_ROLE_KEY = 'STUDENT';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  /**
   * A real hash of a value nobody knows, computed once at boot. Logins for a
   * non-existent email are verified against this so that they cost the same
   * CPU time as logins for a real one — otherwise response latency becomes an
   * oracle for which email addresses have accounts.
   *
   * It must be a genuine hash produced by the configured hasher: a hardcoded
   * or malformed string would fail to parse almost instantly, spending none of
   * the time this exists to spend.
   */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash(randomUUID());
  }

  async register(
    input: { email: string; password: string; name: string },
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Deliberately explicit rather than vague. Email enumeration is already
      // possible through any signup form that refuses duplicates, and pretending
      // otherwise here would only make a legitimate "you already have an
      // account" case unexplainable to the person hitting it.
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.hasher.hash(input.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash,
        roles: {
          create: {
            role: { connect: { key: DEFAULT_ROLE_KEY } },
          },
        },
      },
      include: { roles: { include: { role: true } } },
    });

    const authenticated: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((assignment) => assignment.role.key),
    };

    return { user: authenticated, tokens: await this.startSession(authenticated, context) };
  }

  async login(
    input: { email: string; password: string },
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    const email = input.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    // Verify a hash even when no user exists, so that "unknown email" and
    // "wrong password" take indistinguishable time. Skipping the work on the
    // unknown-email path turns response latency into an account oracle.
    const storedHash = user?.passwordHash ?? this.dummyHash;
    const passwordMatches = await this.hasher.verify(storedHash, input.password);

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('This account is not active');
    }

    // Opportunistic rehash: the only moment the plaintext is available is right
    // now, so raising Argon2 parameters later costs one rehash per user at
    // their next login rather than a migration that cannot be written.
    if (this.hasher.needsRehash(user.passwordHash)) {
      const rehashed = await this.hasher.hash(input.password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: rehashed },
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const authenticated: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((assignment) => assignment.role.key),
    };

    return { user: authenticated, tokens: await this.startSession(authenticated, context) };
  }

  /**
   * Exchanges a refresh token for a new pair, and detects replay.
   *
   * Each refresh token is single-use. Presenting one that has already been
   * rotated means either the legitimate client or an attacker is replaying it,
   * and there is no way to tell which — so the entire family (every token
   * descended from that login) is revoked and the user must authenticate
   * again. That is the whole point of `token_family_id`.
   */
  async refresh(presentedToken: string, context: RequestContext): Promise<SessionTokens> {
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      if (stored.revokedReason === RefreshTokenRevokedReason.ROTATED) {
        await this.revokeFamily(
          stored.tokenFamilyId,
          RefreshTokenRevokedReason.REUSE_DETECTED,
        );
        this.logger.warn(
          `Refresh token reuse detected for user ${stored.userId}; revoked family ${stored.tokenFamilyId}`,
        );
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (stored.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('This account is not active');
    }

    // Conditional update: whoever flips revoked_at from NULL wins. If two
    // requests arrive with the same token, exactly one rotates it and the other
    // sees 0 rows affected — treated as replay rather than silently issuing a
    // second live token into the family.
    //
    // The tradeoff is real: a client that fires two refreshes concurrently
    // (two tabs, a double-submit) will lose its session rather than get a
    // harmless duplicate. Chosen deliberately — an attacker replaying a stolen
    // token is indistinguishable from that case, and failing closed is the
    // right default for the one that matters.
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: RefreshTokenRevokedReason.ROTATED,
      },
    });

    if (rotated.count !== 1) {
      await this.revokeFamily(stored.tokenFamilyId, RefreshTokenRevokedReason.REUSE_DETECTED);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user: AuthenticatedUser = {
      id: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      roles: stored.user.roles.map((assignment) => assignment.role.key),
    };

    // Same family: this is a continuation of the original login, not a new one.
    return this.issueTokens(user, stored.tokenFamilyId, context);
  }

  /** Revokes the presented token's whole family — logging out the device. */
  async logout(presentedToken: string): Promise<void> {
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    // Silent on an unknown or already-dead token: logout is idempotent, and
    // telling a caller whether a token existed is an oracle for no benefit.
    if (!stored || stored.revokedAt) {
      return;
    }

    await this.revokeFamily(stored.tokenFamilyId, RefreshTokenRevokedReason.LOGOUT);
  }

  async findAuthenticatedUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE },
      include: { roles: { include: { role: true } } },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((assignment) => assignment.role.key),
    };
  }

  /**
   * Starts a session for a user who has already been authenticated by some
   * other means — Google sign-in, or completing an approved admin registration.
   *
   * Public because those flows live in their own services (they have their own
   * substantial concerns and do not belong inside this class), but session
   * issuing must stay in exactly one place: token families, refresh-token
   * hashing and TTLs are invariants, not per-flow decisions.
   */
  startSessionFor(user: AuthenticatedUser, context: RequestContext): Promise<SessionTokens> {
    return this.startSession(user, context);
  }

  /** A fresh login starts a new family, so devices are revoked independently. */
  private startSession(user: AuthenticatedUser, context: RequestContext): Promise<SessionTokens> {
    return this.issueTokens(user, randomUUID(), context);
  }

  private async issueTokens(
    user: AuthenticatedUser,
    tokenFamilyId: string,
    context: RequestContext,
  ): Promise<SessionTokens> {
    const { token, tokenHash } = this.tokens.generateRefreshToken();
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenFamilyId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        userAgent: context.userAgent,
        ip: context.ip,
      },
    });

    return {
      accessToken: await this.tokens.signAccessToken(user),
      refreshToken: token,
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
    };
  }

  private async revokeFamily(
    tokenFamilyId: string,
    reason: RefreshTokenRevokedReason,
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
