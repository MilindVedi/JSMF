import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createPublicKey, createVerify } from 'node:crypto';
import { AppConfig } from '../../../config/config.module';

export interface GoogleIdentity {
  /** Google's immutable subject id. The stable key — never the email. */
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

interface GoogleJwks {
  keys: {
    kid: string;
    n: string;
    e: string;
    alg: string;
    use: string;
    kty: string;
  }[];
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * Google's half of the authorization-code flow: build the consent URL, redeem
 * the code, and verify the returned `id_token`.
 *
 * Written against Google's documented endpoints rather than `google-auth-library`
 * or a Passport strategy, matching how Razorpay is integrated here — the
 * surface actually used is small, and a Passport strategy would drag in a
 * session/middleware model this API does not otherwise have.
 *
 * The `id_token` signature is verified against Google's published keys. Reading
 * its claims without verifying would accept anything anyone posted to the
 * callback, which is the whole attack.
 */
@Injectable()
export class GoogleOAuthClient {
  private readonly logger = new Logger(GoogleOAuthClient.name);
  private jwksCache: { fetchedAt: number; jwks: GoogleJwks } | null = null;

  constructor(private readonly config: AppConfig) {}

  get isEnabled(): boolean {
    return this.config.get('GOOGLE_OAUTH_ENABLED');
  }

  /** The URL to send the browser to. `state` is opaque to Google and returned verbatim. */
  buildConsentUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.requireClientId(),
      redirect_uri: this.config.get('GOOGLE_CALLBACK_URL'),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      // Forces the account chooser instead of silently reusing whichever Google
      // account the browser is already signed into — the usual cause of "it
      // logged me in as the wrong person".
      prompt: 'select_account',
    });

    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  /** Exchanges the one-time code for tokens, then verifies the identity inside. */
  async exchangeCode(code: string): Promise<GoogleIdentity> {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.requireClientId(),
        client_secret: this.requireClientSecret(),
        redirect_uri: this.config.get('GOOGLE_CALLBACK_URL'),
        grant_type: 'authorization_code',
      }),
    });

    const payload = (await response.json()) as { id_token?: string; error_description?: string };

    if (!response.ok || !payload.id_token) {
      const reason = payload.error_description ?? `HTTP ${response.status}`;
      this.logger.error(`Google token exchange failed: ${reason}`);
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    return this.verifyIdToken(payload.id_token);
  }

  /**
   * Verifies signature, issuer, audience and expiry before trusting a claim.
   *
   * `email_verified` is checked by the caller, not here: an unverified Google
   * email must never be matched against an existing JSMF account, because
   * anyone can create a Google account claiming an address they do not own.
   */
  private async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    const [headerPart, payloadPart, signaturePart] = idToken.split('.');
    if (!headerPart || !payloadPart || !signaturePart) {
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    const header = decodeSegment<{ kid: string; alg: string }>(headerPart);
    if (header.alg !== 'RS256') {
      // Pinning the algorithm: without it, `alg: none` would verify.
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    const jwks = await this.fetchJwks();
    const key = jwks.keys.find((candidate) => candidate.kid === header.kid);
    if (!key) {
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    const publicKey = createPublicKey({
      key: { kty: 'RSA', n: key.n, e: key.e },
      format: 'jwk',
    });

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerPart}.${payloadPart}`);

    if (!verifier.verify(publicKey, Buffer.from(signaturePart, 'base64url'))) {
      this.logger.warn('Rejected a Google id_token with an invalid signature');
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    const claims = decodeSegment<{
      iss: string;
      aud: string;
      sub: string;
      exp: number;
      email?: string;
      email_verified?: boolean;
      name?: string;
    }>(payloadPart);

    if (!GOOGLE_ISSUERS.includes(claims.iss)) {
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    // Without the audience check, an id_token minted for a *different*
    // application would be accepted here — a well-known cross-client confusion
    // attack.
    if (claims.aud !== this.requireClientId()) {
      this.logger.warn('Rejected a Google id_token issued for another client id');
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }

    if (claims.exp * 1000 <= Date.now()) {
      throw new BadRequestException('Google sign-in timed out. Please try again.');
    }

    if (!claims.email) {
      throw new BadRequestException('Google did not return an email address.');
    }

    return {
      providerUserId: claims.sub,
      email: claims.email.trim().toLowerCase(),
      emailVerified: claims.email_verified === true,
      name: claims.name?.trim() || claims.email.split('@')[0],
    };
  }

  /** Cached for an hour — Google rotates these keys, so they cannot be pinned. */
  private async fetchJwks(): Promise<GoogleJwks> {
    if (this.jwksCache && Date.now() - this.jwksCache.fetchedAt < 3_600_000) {
      return this.jwksCache.jwks;
    }

    const response = await fetch(GOOGLE_JWKS_URI);
    if (!response.ok) {
      throw new ServiceUnavailableException('Could not reach Google to verify sign-in.');
    }

    const jwks = (await response.json()) as GoogleJwks;
    this.jwksCache = { fetchedAt: Date.now(), jwks };
    return jwks;
  }

  private requireClientId(): string {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not configured.');
    return clientId;
  }

  private requireClientSecret(): string {
    const secret = this.config.get('GOOGLE_CLIENT_SECRET');
    if (!secret) throw new ServiceUnavailableException('Google sign-in is not configured.');
    return secret;
  }
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
}
