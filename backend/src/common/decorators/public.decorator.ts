import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without authentication.
 *
 * The guard is applied globally and routes opt OUT, rather than being applied
 * per-route and opting in. That ordering matters: forgetting this decorator
 * makes a public endpoint return 401 (loud, immediately obvious), whereas
 * forgetting to add a guard would silently expose a private one.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
