import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../../../config/config.module';
import { JwtKeyProvider } from '../infrastructure/jwt-key-provider';

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  email: string;
  roles: string[];
  /** Guards against a refresh token ever being accepted as an access token. */
  type: 'access';
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly keys: JwtKeyProvider,
    private readonly config: AppConfig,
  ) {}

  /**
   * Roles are embedded in the token so authorising a request costs no database
   * round trip. The tradeoff is that a role change does not take effect until
   * the token is refreshed — bounded by JWT_ACCESS_TTL (15 minutes by default),
   * which is the reason that TTL is short.
   */
  async signAccessToken(user: { id: string; email: string; roles: string[] }): Promise<string> {
    return this.jwt.signAsync(
      {
        email: user.email,
        roles: user.roles,
        type: 'access',
      },
      {
        algorithm: 'RS256',
        privateKey: this.keys.privateKeyPem,
        keyid: this.keys.keyId,
        subject: user.id,
        issuer: this.config.get('JWT_ISSUER'),
        audience: this.config.get('JWT_AUDIENCE'),
        // Cast: @nestjs/jwt types this as the `ms` package's template-literal
        // union, which a config-sourced string cannot satisfy structurally.
        // The value is validated at boot by env.ts.
        expiresIn: this.config.get('JWT_ACCESS_TTL') as unknown as number,
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    let claims: AccessTokenClaims;

    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        // Pinning the algorithm is not optional. Without it, a token whose
        // header says `alg: none` — or a symmetric algorithm keyed on the
        // public key, which is public — would verify.
        algorithms: ['RS256'],
        publicKey: this.keys.publicKeyPem,
        issuer: this.config.get('JWT_ISSUER'),
        audience: this.config.get('JWT_AUDIENCE'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (claims.type !== 'access') {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return claims;
  }

  /**
   * Refresh tokens are opaque random strings rather than JWTs: rotation and
   * revocation require a database lookup regardless, so signing would buy
   * nothing. Only the SHA-256 hash is stored, so a leaked database dump does
   * not yield usable refresh tokens.
   */
  generateRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
