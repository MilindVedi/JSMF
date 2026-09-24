import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { AppConfig } from '../../../config/config.module';

export interface JsonWebKey {
  kty: string;
  n: string;
  e: string;
  alg: 'RS256';
  use: 'sig';
  kid: string;
}

/**
 * Owns the signing keypair. The private key never leaves this service; the
 * public half is published as a JWKS document so any other JSMF application —
 * or a future standalone auth service — can verify tokens without being
 * configured with, or trusted with, the key that signs them.
 */
@Injectable()
export class JwtKeyProvider implements OnModuleInit {
  private readonly logger = new Logger(JwtKeyProvider.name);

  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  /** PEM forms, because @nestjs/jwt's sign/verify options take strings. */
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly keyId: string;

  constructor(private readonly config: AppConfig) {
    const decode = (value: string): string => Buffer.from(value, 'base64').toString('utf8');

    this.privateKeyPem = decode(this.config.get('JWT_PRIVATE_KEY_BASE64'));
    this.publicKeyPem = decode(this.config.get('JWT_PUBLIC_KEY_BASE64'));
    this.privateKey = createPrivateKey(this.privateKeyPem);
    this.publicKey = createPublicKey(this.publicKeyPem);
    this.keyId = this.config.get('JWT_KEY_ID');
  }

  onModuleInit(): void {
    // Fail at boot, not at the first login: a keypair whose halves do not match
    // produces tokens that this very service cannot verify, and the symptom
    // ("login works, every subsequent request is 401") is deeply confusing.
    const derived = createPublicKey(this.privateKey).export({ type: 'spki', format: 'pem' });
    const configured = this.publicKey.export({ type: 'spki', format: 'pem' });

    if (derived.toString() !== configured.toString()) {
      throw new Error(
        'JWT_PUBLIC_KEY_BASE64 is not the public half of JWT_PRIVATE_KEY_BASE64 — ' +
          'tokens would be signed with a key nothing can verify.',
      );
    }

    this.logger.log(`Signing key loaded (kid=${this.keyId}, RS256)`);
  }

  /** The public key in JWKS form, for `GET /api/auth/jwks`. */
  toJwks(): { keys: JsonWebKey[] } {
    const jwk = this.publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string };

    return {
      keys: [
        {
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e,
          alg: 'RS256',
          use: 'sig',
          kid: this.keyId,
        },
      ],
    };
  }
}
