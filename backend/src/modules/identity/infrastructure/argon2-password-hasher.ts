import { Injectable } from '@nestjs/common';
import { Algorithm, hash, parseOptions, verify } from '@node-rs/argon2';
import { PasswordHasher } from '../domain/password-hasher.port';

/**
 * Argon2id — memory-hard, so an attacker with GPUs gains far less against it
 * than against bcrypt. Parameters follow current OWASP guidance (19 MiB,
 * 2 iterations, parallelism 1); `needsRehash` means raising them later only
 * costs a rehash at each user's next login rather than a flag day.
 */
export const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456, // KiB — 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  hash(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  }

  async verify(hashed: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(hashed, plaintext, ARGON2_OPTIONS);
    } catch {
      // A malformed hash, or one written by a different algorithm, is a failed
      // login — not an error worth surfacing to the caller as a crash.
      return false;
    }
  }

  /**
   * This binding has no `needsRehash`, so it is derived from the parameters
   * encoded in the hash itself. Only *weaker* parameters count as stale: a
   * hash produced with stronger settings than current policy is left alone
   * rather than being downgraded.
   */
  needsRehash(hashed: string): boolean {
    let parsed: ReturnType<typeof parseOptions>;

    try {
      parsed = parseOptions(hashed);
    } catch {
      // Unparseable by Argon2 ⇒ produced by something else (a legacy bcrypt
      // hash, say) ⇒ definitely stale.
      return true;
    }

    if (parsed.algorithm !== ARGON2_OPTIONS.algorithm) return true;

    return (
      (parsed.memoryCost ?? 0) < ARGON2_OPTIONS.memoryCost ||
      (parsed.timeCost ?? 0) < ARGON2_OPTIONS.timeCost ||
      (parsed.parallelism ?? 0) < ARGON2_OPTIONS.parallelism
    );
  }
}
