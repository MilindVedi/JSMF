import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { activity } from '../../shared/logging/activity';

const logger = new Logger('Https');

/** Liveness and readiness probes, which reach the container over plain HTTP. */
const EXEMPT_PATHS = new Set(['/api/health', '/api/health/ready']);

/**
 * Refuses a request that a proxy tells us arrived over plain HTTP.
 *
 * Payment credentials, session cookies and bearer tokens travel on these
 * routes; over HTTP they travel in the clear, and Razorpay's integration
 * checklist requires TLS end to end. The platform is served behind a proxy
 * that terminates TLS, so the only honest evidence of the original scheme is
 * `x-forwarded-proto`.
 *
 * Two deliberate narrowings, so this can never take the site down by itself:
 *
 * - **Only when the header is present.** A request with no `x-forwarded-proto`
 *   did not come through the proxy — a container-internal health probe, or a
 *   developer on localhost — and is left alone. The header is trustworthy here
 *   for the same reason `req.ip` is: `trust proxy` is configured in main.ts,
 *   and a client-supplied header on a direct connection can only make this
 *   stricter, never laxer.
 * - **Only in production.** Local and preview environments run over HTTP by
 *   design.
 *
 * A redirect is deliberately not issued: these are API calls, not page loads.
 * Redirecting a POST would invite the client to replay the body — including
 * the credentials that were just exposed — rather than fail loudly.
 */
export function requireHttps(req: Request, res: Response, next: NextFunction): void {
  const forwarded = req.headers['x-forwarded-proto'];
  if (forwarded === undefined) return next();

  // A chain of proxies appends to the header; the first value is the scheme
  // the browser actually used.
  const scheme = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0]?.trim();
  const path = (req.originalUrl ?? req.url).split('?')[0];

  if (scheme === 'https' || EXEMPT_PATHS.has(path)) return next();

  activity(logger, 'http.insecure_rejected', { method: req.method, path, scheme }, 'warn');

  res.status(403).json({
    statusCode: 403,
    error: 'Forbidden',
    message: 'This API is available over HTTPS only.',
  });
}
