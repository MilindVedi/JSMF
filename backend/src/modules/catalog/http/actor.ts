import type { Request } from 'express';
import type { AuthenticatedUser } from '../../identity/application/auth.service';
import type { Actor } from '../application/product.service';

/**
 * Every catalogue mutation is attributed to a person and an origin, because
 * the audit trail is only useful if it can answer "who changed the price, and
 * from where".
 */
export function actorFrom(user: AuthenticatedUser, request: Request): Actor {
  return { id: user.id, ip: request.ip ?? null };
}
