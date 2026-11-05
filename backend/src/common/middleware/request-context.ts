import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../../shared/logging/request-context';
import { parseTraceHeaders } from '../../shared/logging/trace-context';

/** Sent back on every response, so a bug report or support email can quote it. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Opens the logging context for one request — the first middleware, so every
 * line written while serving it carries its `requestId` and trace (see
 * shared/logging/request-context.ts).
 *
 * The request id is always generated here. An `X-Request-Id` sent by the
 * caller is ignored rather than adopted: anyone can send one, and an id that
 * an outsider chose could be made to collide with someone else's request and
 * muddy exactly the investigation it exists to make easy. The Cloud Trace id
 * is taken from the headers because it is what links these lines to Cloud
 * Run's own request log; see trace-context.ts for why that is safe.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithRequestContext(
    {
      requestId,
      trace: parseTraceHeaders(req.headers),
      method: req.method,
      path: (req.originalUrl ?? req.url).split('?')[0].slice(0, 512),
      // Attached by JwtAuthGuard later in the request, if a valid token came.
      userId: () => (req as Request & { user?: { id?: string } }).user?.id,
    },
    next,
  );
}
