import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerStorage,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { TokenService } from '../../modules/identity/application/token.service';

/** The per-IP backstop, which is keyed on address even for signed-in callers. */
export const IP_CEILING_THROTTLER = 'ip-ceiling';

/**
 * Rate limiting keyed on *who* is asking rather than where from.
 *
 * An IP address was only ever standing in for an identity, and on a shared
 * network it stands in badly: a school or hostel puts hundreds of devices
 * behind one public address, so under plain IP limiting they share a single
 * allowance and the twenty-first student to sign in is refused for something
 * the other twenty did. Raising the numbers does not fix that — it just moves
 * the point at which the wrong people are blocked.
 *
 * So when a request carries a valid access token it is counted against the
 * account, which is the thing the limit was always meant to describe. Only
 * anonymous traffic falls back to the address, because then there is genuinely
 * nothing else to go on.
 *
 * Two layers, because per-account counting widens one gap: someone holding
 * several accounts would get an allowance per account. The `ip-ceiling`
 * throttler therefore counts every request against its source address as well,
 * at a limit no shared network would reach but a script would cross
 * immediately. A hostel never sees it; a flood hits it whatever it signs in as.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly tokens: TokenService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * The token is **verified**, never merely decoded. A JWT's payload is
   * readable — and writable — by anyone holding it, so trusting an unverified
   * `sub` would let a caller invent a new identity per request and mint
   * themselves unlimited buckets. That is strictly worse than counting by
   * address, which at least cannot be chosen freely.
   *
   * Only the signature is checked; unlike `JwtAuthGuard` there is no lookup to
   * confirm the account still exists. Rate limiting only needs a stable name to
   * count against, and a suspended user's requests are refused a moment later
   * by the guard that does care.
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const token = bearerToken(req);

    if (token) {
      try {
        const claims = await this.tokens.verifyAccessToken(token);
        // Keyed on the subject, not the token: access tokens rotate on refresh,
        // and a fresh token must not come with a fresh allowance.
        if (claims?.sub) return `user:${claims.sub}`;
      } catch {
        // Expired, forged or malformed — treat as anonymous and count by
        // address. Rejecting it is the authentication guard's job, not ours.
      }
    }

    return `ip:${ipOf(req)}`;
  }

  /**
   * The ceiling ignores the tracker above and counts by address always, which
   * is the entire point of having it: it has to still apply to someone who is
   * signed in, and to each of the several accounts one person might hold.
   */
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    if (name === IP_CEILING_THROTTLER) {
      const req = context.switchToHttp().getRequest<Record<string, unknown>>();
      return super.generateKey(context, `ip:${ipOf(req)}`, name);
    }

    return super.generateKey(context, suffix, name);
  }
}

function bearerToken(req: Record<string, unknown>): string | null {
  const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
  const raw = headers?.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;

  if (!header) return null;

  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;

  return value.trim() || null;
}

/**
 * Resolved by Express from `X-Forwarded-For` against `TRUST_PROXY_RANGES` — see
 * that setting for why the chain cannot be counted rather than matched.
 */
function ipOf(req: Record<string, unknown>): string {
  return (req.ip as string | undefined) ?? 'unknown';
}
