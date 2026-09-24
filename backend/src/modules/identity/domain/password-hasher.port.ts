/**
 * Password hashing behind a port, for the same reason storage and payments are:
 * the algorithm is an implementation detail with a real chance of changing.
 *
 * It also buys something specific here — `needsRehash`. Changing hashing
 * parameters (or algorithms) after real accounts exist cannot be done with a
 * migration, because a hash cannot be recomputed without the plaintext. The
 * only way is to rehash opportunistically at login, when the password is
 * briefly in hand. Callers ask this port whether a stored hash is stale rather
 * than knowing anything about what produced it.
 */
export abstract class PasswordHasher {
  abstract hash(plaintext: string): Promise<string>;

  /**
   * Must not throw on a malformed or foreign-format hash — return false.
   * A stored hash from a previous algorithm is a failed login, not a 500.
   */
  abstract verify(hash: string, plaintext: string): Promise<boolean>;

  /** True when `hash` was produced with weaker parameters than current policy. */
  abstract needsRehash(hash: string): boolean;
}
