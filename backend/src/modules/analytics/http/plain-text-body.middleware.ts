import type { NextFunction, Request, Response } from 'express';
import { MAX_BODY_BYTES } from '../domain/analytics-event';

/**
 * Reads a `text/plain` body into `req.body` as a string, for the one route
 * that accepts one.
 *
 * `navigator.sendBeacon` — the only reliable way to send the last events as a
 * tab closes — can send JSON only as text/plain without triggering a CORS
 * preflight, and Nest parses JSON and form bodies only. Scoped to the
 * analytics route (see AnalyticsModule) rather than registered app-wide, so
 * no other endpoint starts receiving string bodies.
 *
 * Over the size limit the body is discarded and the request still completes:
 * the route answers 204 to everything.
 */
export function plainTextBody(req: Request, _res: Response, next: NextFunction): void {
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
    if (size > MAX_BODY_BYTES) {
      tooLarge = true;
      chunks.length = 0;
      return;
    }
    if (!tooLarge) chunks.push(chunk);
  });
  req.on('end', finish);
  req.on('error', finish);
}
