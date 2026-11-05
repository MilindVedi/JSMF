import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Reads a `text/plain` body into `req.body` as a string, for the few routes
 * that accept one.
 *
 * `navigator.sendBeacon` — the only reliable way to send something as a tab
 * closes — can send JSON only as text/plain without triggering a CORS
 * preflight, and Nest parses JSON and form bodies only. Applied per route
 * (see AnalyticsModule, ClientErrorsModule) rather than app-wide, so no other
 * endpoint starts receiving string bodies.
 *
 * Over `maxBytes` the body is discarded and the request still completes: the
 * routes using this answer 204 to everything.
 */
export function plainTextBody(maxBytes: number): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const type = req.headers['content-type'] ?? '';
    if (!/^text\/plain\b/i.test(type) || req.readableEnded) {
      next();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      req.body = tooLarge ? '' : Buffer.concat(chunks).toString('utf8');
      next();
    };

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', finish);
    req.on('error', finish);
  };
}
