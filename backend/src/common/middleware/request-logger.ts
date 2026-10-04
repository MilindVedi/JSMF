import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { activity } from '../../shared/logging/activity';

const logger = new Logger('Http');

/** Probes that would otherwise be most of the log volume and say nothing. */
const QUIET_PATHS = new Set(['/api/health', '/api/health/ready']);

/**
 * One `http.request` line per API call: method, path, status, how long it took
 * and — when signed in — who made it. The authenticated user is read when the
 * response finishes, because the auth guard attaches it after this runs.
 *
 * The query string is dropped on purpose: OAuth callbacks, password resets
 * and signed downloads carry codes and tokens there, and a log line is not a
 * place for a credential.
 *
 * Levels: 5xx ERROR (something on our side broke), 4xx WARNING (worth a look
 * when a buyer reports a problem), the rest INFO.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const path = (req.originalUrl ?? req.url).split('?')[0];
    if (QUIET_PATHS.has(path)) return;

    const status = res.statusCode;
    const user = (req as Request & { user?: { id?: string } }).user;

    activity(
      logger,
      'http.request',
      {
        method: req.method,
        path,
        status,
        durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        userId: user?.id,
        ip: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 160),
      },
      status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log',
    );
  });

  next();
}
